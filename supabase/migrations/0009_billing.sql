-- Billing: what each call costs JETZT (Telnyx's per-minute rates), what each
-- organization pays (cost plus its markup), monthly spend for budgets and
-- statements, and releasing phone numbers.
--
-- Run in the Supabase SQL editor after 0008. Runs as one transaction: if any
-- statement fails, nothing is applied. Safe while the current app is live:
-- it only adds a table, columns, indexes and a function.

begin;

-- 1. Telnyx's rates --------------------------------------------------------------
-- Filled from Telnyx's rate deck by scripts/import-rate-deck.mjs; re-run it
-- when Telnyx changes rates. Every row bills per started minute. origination
-- '' applies to any caller ID; 'local' applies when the caller ID is in the
-- same country as the number dialed (some of those add a per-call fee).

create table call_rates (
  destination_prefix text not null check (destination_prefix ~ '^[0-9]{1,15}$'),
  origination text not null default '' check (origination in ('', 'local')),
  country_code text not null,
  description text,
  rate_per_min numeric not null check (rate_per_min >= 0),
  price_per_call numeric not null default 0 check (price_per_call >= 0),
  imported_at timestamptz not null default now(),
  primary key (destination_prefix, origination)
);

-- Server only: RLS on, no policies.
alter table call_rates enable row level security;

-- 2. What each call cost ------------------------------------------------------------
-- Legs are timed from Telnyx's own webhooks, not the browser. A phone-bridge
-- call is two billed legs (Telnyx -> the agent's phone for the whole session,
-- and Telnyx -> the lead); a browser call is just the lead leg.

alter table calls
  add column mode text check (mode in ('phone', 'browser')),
  add column caller_id_number text,
  add column agent_phone_number text,
  add column agent_leg_seconds int check (agent_leg_seconds >= 0),
  add column lead_leg_seconds int check (lead_leg_seconds >= 0),
  add column cost_usd numeric check (cost_usd >= 0),
  add column price_usd numeric check (price_usd >= 0),
  add column billed_at timestamptz,
  add column billing_note text;

-- Calls still in progress, for the simultaneous-calls limit.
create index idx_calls_org_open on calls(org_id, created_at) where ended_at is null;

-- 3. Phone numbers: price fixed when bought, and releasing ------------------------
-- monthly_price / upfront_price are what the organization pays (cost plus
-- its number markup at the time it was bought). A released number keeps its
-- row for statements, and the same number can be bought again later.

alter table phone_numbers
  add column monthly_price numeric check (monthly_price >= 0),
  add column upfront_price numeric check (upfront_price >= 0),
  add column released_at timestamptz,
  add column released_by text,
  add constraint phone_numbers_released_not_active check (released_at is null or not is_active);

alter table phone_numbers drop constraint if exists phone_numbers_phone_number_key;
alter table phone_numbers drop constraint if exists phone_numbers_telnyx_id_key;
create unique index idx_phone_numbers_number_held
  on phone_numbers(phone_number) where released_at is null;
create unique index idx_phone_numbers_telnyx_id_held
  on phone_numbers(telnyx_id) where released_at is null;

-- 4. Monthly spend ----------------------------------------------------------------
-- One organization's charges for the calendar month (UTC) containing p_month:
--   calls:   the stored cost and price of each call made that month;
--   numbers: the full monthly price for every month a number was held, plus
--            its upfront price in the month it was bought;
--   voice:   started minutes of AI voice assistant calls x the
--            organization's per-minute price.

create or replace function public.org_month_spend(p_org uuid, p_month date)
returns table (
  calls_cost numeric,
  calls_price numeric,
  numbers_cost numeric,
  numbers_price numeric,
  voice_price numeric,
  total_cost numeric,
  total_price numeric
)
language sql
stable
set search_path = public
as $$
  with bounds as (
    select
      date_trunc('month', p_month::timestamp) at time zone 'UTC' as m_start,
      (date_trunc('month', p_month::timestamp) + interval '1 month') at time zone 'UTC' as m_end
  ),
  org as (
    select number_markup_pct, voice_assistant_price_per_min
    from organizations
    where id = p_org
  ),
  call_totals as (
    select coalesce(sum(c.cost_usd), 0) as cost, coalesce(sum(c.price_usd), 0) as price
    from calls c, bounds b
    where c.org_id = p_org
      and c.created_at >= b.m_start
      and c.created_at < b.m_end
  ),
  number_totals as (
    select
      coalesce(sum(
        coalesce(n.monthly_cost, 0)
        + case when n.purchased_at >= b.m_start then coalesce(n.upfront_cost, 0) else 0 end
      ), 0) as cost,
      coalesce(sum(
        coalesce(n.monthly_price, n.monthly_cost * (1 + o.number_markup_pct / 100), 0)
        + case when n.purchased_at >= b.m_start
               then coalesce(n.upfront_price, n.upfront_cost * (1 + o.number_markup_pct / 100), 0)
               else 0 end
      ), 0) as price
    from phone_numbers n, bounds b, org o
    where n.org_id = p_org
      and n.purchased_at < b.m_end
      and (n.released_at is null or n.released_at >= b.m_start)
  ),
  voice_totals as (
    select coalesce(sum(ceil(extract(epoch from (v.ended_at - v.started_at)) / 60.0)), 0) as minutes
    from voice_agent_calls v, bounds b
    where v.org_id = p_org
      and v.started_at >= b.m_start
      and v.started_at < b.m_end
      and v.ended_at > v.started_at
  ),
  voice_rate as (
    select coalesce((select voice_assistant_price_per_min from org), 0) as per_min
  )
  select
    ct.cost,
    ct.price,
    nt.cost,
    nt.price,
    vt.minutes * vr.per_min,
    ct.cost + nt.cost,
    ct.price + nt.price + vt.minutes * vr.per_min
  from call_totals ct, number_totals nt, voice_totals vt, voice_rate vr;
$$;

-- Supabase lets browsers call public functions through the API by default.
-- Spend is read only by the server.
revoke all on function public.org_month_spend(uuid, date) from public, anon, authenticated;
grant execute on function public.org_month_spend(uuid, date) to service_role;

commit;

-- Free credit and bonus minutes the super admin gives an organization.
--
--   credit   a dollar amount (a gift, a goodwill credit). It pays the
--            organization's charges -- calls, numbers, voice assistant -- month
--            by month from the month it's given, carrying over until used up
--            or until the month it expires.
--   minutes  free minutes for calls to leads in one country (or any country
--            when country_code is empty). Each call's billed minutes come off
--            the grant until none are left or it expires.
--
-- Free usage doesn't count against the monthly budget: the budget limits what
-- the organization actually pays.
--
-- Run in the Supabase SQL editor. Runs as one transaction; only adds things.

begin;

create table org_grants (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  kind text not null check (kind in ('credit', 'minutes')),
  amount_usd numeric check (amount_usd > 0),
  minutes int check (minutes > 0),
  country_code text check (country_code ~ '^[A-Z]{2}$'),
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  note text,
  created_by text not null,
  created_at timestamptz not null default now(),
  -- Revoking stops the unused part from now on; what was already used stays.
  revoked_at timestamptz,
  revoked_by text,
  constraint org_grants_shape check (
    (kind = 'credit' and amount_usd is not null and minutes is null and country_code is null)
    or (kind = 'minutes' and minutes is not null and amount_usd is null)
  ),
  constraint org_grants_dates check (expires_at is null or expires_at > starts_at)
);

create index idx_org_grants_org on org_grants(org_id, kind);

-- Server only: RLS on, no policies.
alter table org_grants enable row level security;

-- Bonus minutes used by each call, and which grant they came from.
alter table calls
  add column bonus_minutes int not null default 0 check (bonus_minutes >= 0),
  add column bonus_grant_id uuid references org_grants(id) on delete set null;

create index idx_calls_bonus_grant on calls(bonus_grant_id) where bonus_grant_id is not null;

commit;

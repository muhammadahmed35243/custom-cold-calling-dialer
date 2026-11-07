-- Organizations: one super admin (contact.thejetzt@gmail.com) over isolated
-- sub-admin organizations. JETZT becomes the founding organization and every
-- existing row moves into it.
--
-- Run in the Supabase SQL editor AFTER migration 0006. Runs as one
-- transaction: if any statement fails, nothing is applied.

begin;

-- 1. Organizations ----------------------------------------------------------

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active' check (status in ('active', 'suspended')),
  -- Null limit = unlimited.
  monthly_budget_usd numeric check (monthly_budget_usd >= 0),
  call_markup_pct numeric not null default 0 check (call_markup_pct >= 0),
  number_markup_pct numeric not null default 0 check (number_markup_pct >= 0),
  voice_assistant_price_per_min numeric not null default 0 check (voice_assistant_price_per_min >= 0),
  max_agents int check (max_agents >= 0),
  max_phone_numbers int check (max_phone_numbers >= 0),
  max_concurrent_calls int check (max_concurrent_calls >= 0),
  allowed_country_codes text[],
  ai_features_enabled boolean not null default true,
  voice_assistant_enabled boolean not null default false,
  recording_enabled boolean not null default true,
  recording_retention_days int check (recording_retention_days > 0),
  calling_hours_start smallint check (calling_hours_start between 0 and 23),
  calling_hours_end smallint check (calling_hours_end between 1 and 24),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Fixed id so code and the voice runtime can refer to the founding org.
insert into organizations (id, name, voice_assistant_enabled)
values ('00000000-0000-0000-0000-000000000001', 'JETZT', true);

-- Browsers never read these directly (server routes only): RLS on, no policies.
alter table organizations enable row level security;

-- 2. Drop the old role-based policies ----------------------------------------
-- Postgres won't change agents.role's type while policies reference it, and
-- every one of these grants an admin visibility across all data, which would
-- leak between organizations. Only the leads one is still needed by browser
-- code (the dialer's pending-leads queue); it is recreated org-scoped below.
-- The rest were already unused by browsers (all those reads go through
-- server routes), so they are not recreated.

drop policy if exists "Admin can view all calls" on calls;
drop policy if exists "Admins view all leads" on leads;
drop policy if exists "Admins can view phone numbers" on phone_numbers;
drop policy if exists "Admins can view agent_config" on agent_config;
drop policy if exists "Admins can view knowledge_base" on knowledge_base;
drop policy if exists "Admins can view insights" on insights;
drop policy if exists "Admins can view voice_agent_calls" on voice_agent_calls;
drop policy if exists "Admins can view fallback_messages" on fallback_messages;
drop policy if exists "Admins can view calendly_bookings" on calendly_bookings;

-- 3. Roles --------------------------------------------------------------------
-- VARCHAR(10) can't hold 'super_admin' (11 chars).

alter table agents drop constraint if exists agents_role_check;
alter table agents alter column role type text;
alter table agents alter column role set default 'agent';
alter table agents add constraint agents_role_check
  check (role in ('super_admin', 'admin', 'agent'));
-- The super admin is always this one account; no UI or bug can grant it to
-- anyone else.
alter table agents add constraint agents_super_admin_email
  check (role <> 'super_admin' or email = 'contact.thejetzt@gmail.com');

-- 4. org_id everywhere ----------------------------------------------------------
-- The default keeps old code (and the voice runtime, which doesn't know about
-- organizations yet) writing valid rows during the cutover. Migration 0008
-- drops it for the dialer's own tables once the new code is live; the voice
-- tables keep it until the runtime is updated.

alter table agents add column org_id uuid not null
  default '00000000-0000-0000-0000-000000000001' references organizations(id);
alter table leads add column org_id uuid not null
  default '00000000-0000-0000-0000-000000000001' references organizations(id);
alter table calls add column org_id uuid not null
  default '00000000-0000-0000-0000-000000000001' references organizations(id);
alter table phone_numbers add column org_id uuid not null
  default '00000000-0000-0000-0000-000000000001' references organizations(id);

alter table agent_config add column org_id uuid not null
  default '00000000-0000-0000-0000-000000000001' references organizations(id);
alter table knowledge_base add column org_id uuid not null
  default '00000000-0000-0000-0000-000000000001' references organizations(id);
alter table insights add column org_id uuid not null
  default '00000000-0000-0000-0000-000000000001' references organizations(id);
alter table voice_agent_calls add column org_id uuid not null
  default '00000000-0000-0000-0000-000000000001' references organizations(id);
alter table fallback_messages add column org_id uuid not null
  default '00000000-0000-0000-0000-000000000001' references organizations(id);
alter table calendly_bookings add column org_id uuid not null
  default '00000000-0000-0000-0000-000000000001' references organizations(id);
alter table caller_memory add column org_id uuid not null
  default '00000000-0000-0000-0000-000000000001' references organizations(id);

create index idx_agents_org on agents(org_id);
create index idx_leads_org_status on leads(org_id, status);
create index idx_calls_org_created on calls(org_id, created_at desc);
create index idx_phone_numbers_org on phone_numbers(org_id);
create index idx_knowledge_base_org on knowledge_base(org_id);
create index idx_insights_org on insights(org_id);
create index idx_voice_agent_calls_org on voice_agent_calls(org_id);
create index idx_fallback_messages_org on fallback_messages(org_id);
create index idx_calendly_bookings_org on calendly_bookings(org_id);

-- One active (default) number per organization, not one in the whole system.
drop index if exists idx_phone_numbers_one_active;
create unique index idx_phone_numbers_one_active_per_org
  on phone_numbers(org_id) where is_active;

-- 5. Promote the super admin ------------------------------------------------

update agents set role = 'super_admin' where email = 'contact.thejetzt@gmail.com';

-- 6. Audit log ----------------------------------------------------------------

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id),
  actor_email text not null,
  action text not null,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index idx_audit_log_org_created on audit_log(org_id, created_at desc);
alter table audit_log enable row level security;

-- 7. Caller helpers for policies ---------------------------------------------
-- security definer reads the caller's own agent row without going through the
-- agents table's RLS, which avoids the infinite recursion an agents-policy
-- subquery on agents would cause (see schema.sql).

create or replace function public.app_role() returns text
  language sql stable security definer set search_path = public
  as $$ select role from agents where email = auth.jwt() ->> 'email' and is_active $$;

create or replace function public.app_org() returns uuid
  language sql stable security definer set search_path = public
  as $$ select org_id from agents where email = auth.jwt() ->> 'email' and is_active $$;

-- 8. Org-scoped policies -------------------------------------------------------
-- The dialer's pending-leads queue reads leads from the browser. Admins (and
-- the super admin, in their own org's dialer) see their organization's
-- pending leads; agents keep "Agents view own pending leads".

create policy "Admins view org leads" on leads
  for select using (
    app_role() in ('admin', 'super_admin') and org_id = app_org()
  );

commit;

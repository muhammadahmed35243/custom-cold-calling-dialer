-- Numbers purchased through the app's own admin UI, tracked separately from
-- the original TELNYX_PHONE_NUMBER env var so the app can grow past a single
-- hardcoded number without a redeploy for every change.
--
-- Run this in the Supabase SQL editor.

create table phone_numbers (
  id uuid primary key default gen_random_uuid(),
  phone_number text not null unique,
  telnyx_id text not null unique,
  country_code text not null,
  monthly_cost numeric,
  upfront_cost numeric,
  is_active boolean not null default false,
  purchased_by text not null,
  purchased_at timestamptz not null default now()
);

create index idx_phone_numbers_purchased_at on phone_numbers(purchased_at desc);

-- At most one number can be the active outbound caller ID at a time --
-- enforced here rather than trusted to application code, since this is the
-- id every outbound call reads.
create unique index idx_phone_numbers_one_active on phone_numbers(is_active) where is_active;

alter table phone_numbers enable row level security;

-- Reads go through the client as the logged-in admin (needs a policy);
-- writes go through the service-role key server-side after requireAdmin(),
-- same split as the voice-agent admin tables.
create policy "Admins can view phone numbers" on phone_numbers
  for select using (
    exists (select 1 from agents where email = auth.jwt() ->> 'email' and role = 'admin')
  );

-- Per-agent outbound caller ID. Null means "use whichever phone_numbers row
-- has is_active = true" (or the TELNYX_PHONE_NUMBER env var if none does) --
-- agents keep working with today's single-number setup until an admin
-- explicitly assigns someone a specific number.
alter table agents add column outbound_phone_number_id uuid references phone_numbers(id) on delete set null;

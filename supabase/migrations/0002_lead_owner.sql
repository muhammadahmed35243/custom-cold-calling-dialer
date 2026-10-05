-- Per-agent lead ownership: each lead belongs to the agent who uploaded or
-- added it. Agents see only their own pending leads; admins see all leads.
--
-- Run this in the Supabase SQL editor. Existing leads have owner_email = null,
-- so they are visible to admins only until reassigned.

alter table leads add column owner_email text;

create index idx_leads_owner_email on leads(owner_email);

drop policy "Authenticated users can view pending leads" on leads;

create policy "Agents view own pending leads" on leads
  for select using (
    status = 'pending'
    and owner_email = auth.jwt() ->> 'email'
    and exists (
      select 1 from agents where email = auth.jwt() ->> 'email' and is_active = true
    )
  );

create policy "Admins view all leads" on leads
  for select using (
    exists (
      select 1 from agents where email = auth.jwt() ->> 'email' and role = 'admin'
    )
  );

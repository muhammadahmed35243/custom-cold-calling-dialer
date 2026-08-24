-- Voice agent admin portal — read access for the dialer's existing admins.
--
-- The voice-agent tables (agent_config, knowledge_base, insights,
-- voice_agent_calls, fallback_messages, calendly_bookings) already exist
-- in this project — created by jetzt-voice-agent's own migration
-- (supabase/migrations/0001_voice_agent_init.sql there), with RLS enabled
-- and deliberately NO policies, since at the time it wasn't decided how
-- the admin portal would access them. Now it's decided: this repo's
-- /api/voice-agent/* routes, following the same pattern as the existing
-- /api/agents/[id] route — reads go straight through supabaseClient as
-- the logged-in user (needs a policy, added below), writes go through
-- the service-role key server-side after an explicit admin check (no
-- policy needed for those, service role bypasses RLS).
--
-- Mirrors the "Authenticated users can view pending leads" /
-- "Admin can view all calls" policies already in supabase/schema.sql —
-- same admin-role check against the agents table.

create policy "Admins can view agent_config" on agent_config
  for select using (
    exists (select 1 from agents where email = auth.jwt() ->> 'email' and role = 'admin')
  );

create policy "Admins can view knowledge_base" on knowledge_base
  for select using (
    exists (select 1 from agents where email = auth.jwt() ->> 'email' and role = 'admin')
  );

create policy "Admins can view insights" on insights
  for select using (
    exists (select 1 from agents where email = auth.jwt() ->> 'email' and role = 'admin')
  );

create policy "Admins can view voice_agent_calls" on voice_agent_calls
  for select using (
    exists (select 1 from agents where email = auth.jwt() ->> 'email' and role = 'admin')
  );

create policy "Admins can view fallback_messages" on fallback_messages
  for select using (
    exists (select 1 from agents where email = auth.jwt() ->> 'email' and role = 'admin')
  );

create policy "Admins can view calendly_bookings" on calendly_bookings
  for select using (
    exists (select 1 from agents where email = auth.jwt() ->> 'email' and role = 'admin')
  );

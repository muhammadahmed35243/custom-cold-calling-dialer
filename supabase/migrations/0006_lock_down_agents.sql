-- Close an admin-takeover hole: the original agents policies let ANY signed-in
-- Google account insert or update ANY agent row through the public REST API
-- (including setting role = 'admin'), and "Public read agents" let even the
-- anon key list every agent's email, phone and role.
--
-- After this, browsers can only read their own agent row. All agent writes go
-- through server routes that use the service role after an admin check.
--
-- Run this in the Supabase SQL editor AFTER the app version that loads the
-- admin page's agents/calls through /api routes is deployed.

drop policy if exists "Public read agents" on agents;
drop policy if exists "Authenticated insert agents" on agents;
drop policy if exists "Authenticated update agents" on agents;

create policy "Agents read own row" on agents
  for select using (email = auth.jwt() ->> 'email');

-- No browser code writes leads; every lead write is server-side with the
-- service role. This policy let any active agent rewrite any lead.
drop policy if exists "Agents can update leads status" on leads;

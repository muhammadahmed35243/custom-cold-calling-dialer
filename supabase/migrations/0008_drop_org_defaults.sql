-- Run ONLY after the Phase 1 (organizations) app version is deployed and live.
--
-- 0007 gave org_id a default of the founding org so code still running during
-- the cutover kept writing valid rows. The new code always sets org_id
-- explicitly, so the default now only hides bugs: a write that forgot org_id
-- would silently land in JETZT's data. Without it, such a write fails loudly.
--
-- The voice tables (agent_config, knowledge_base, insights, voice_agent_calls,
-- fallback_messages, calendly_bookings, caller_memory) keep their default:
-- the voice runtime writes them without org_id until it is updated.

alter table agents alter column org_id drop default;
alter table leads alter column org_id drop default;
alter table calls alter column org_id drop default;
alter table phone_numbers alter column org_id drop default;

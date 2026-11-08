-- Lead lifecycle: when a lead goes back in the queue, and in what order.
--
--   pending      waiting in the queue
--   in_progress  being called right now
--   callback     a follow-up call is scheduled
--   called       done
--
-- After a call: connected -> called; callback -> callback; no answer, busy,
-- voicemail or no connection -> back in the queue, behind the leads not yet
-- tried, until it has been tried 3 times, then called. The app applies this
-- when each call ends; this migration adds the queue order and applies the
-- same rules once to leads left stuck "in progress" by calls that ended
-- without an outcome being saved.
--
-- Run in the Supabase SQL editor. Runs as one transaction.

begin;

-- When the lead was last dialed; the queue puts never-tried leads first, then
-- the retry that has waited longest.
alter table leads add column last_called_at timestamptz;

update leads l
set last_called_at = c.last_call
from (select lead_id, max(created_at) as last_call from calls group by lead_id) c
where c.lead_id = l.id;

create index idx_leads_queue on leads(org_id, status, last_called_at nulls first, created_at);

-- Release stuck leads. Only calls started over 30 minutes ago, so no live
-- call is touched.
with latest as (
  select distinct on (c.lead_id)
    c.lead_id,
    c.disposition,
    c.created_at,
    (c.lead_call_status = 'completed'
      or coalesce(c.lead_leg_seconds, 0) > 0
      or c.lead_answered_at is not null) as answered
  from calls c
  order by c.lead_id, c.created_at desc
),
attempts as (
  select lead_id,
    count(*) filter (
      where lead_call_status is not null
         or twilio_call_sid is not null
         or lead_leg_seconds is not null
    ) as n
  from calls
  group by lead_id
)
update leads l
set status = case
      when lt.disposition = 'callback' then 'callback'
      when lt.disposition = 'connected' then 'called'
      when lt.disposition is null and lt.answered then 'called'
      when coalesce(a.n, 0) >= 3 then 'called'
      else 'pending'
    end,
    assigned_agent = null
from latest lt
left join attempts a on a.lead_id = lt.lead_id
where l.id = lt.lead_id
  and l.status = 'in_progress'
  and lt.created_at < now() - interval '30 minutes';

commit;

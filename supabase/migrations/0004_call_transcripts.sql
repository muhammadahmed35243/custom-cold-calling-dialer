-- Call transcripts: a timeline of Agent/Lead utterances produced from the
-- call's recording after it ends. transcript_status tracks the job so the UI
-- can show pending/ready/failed.
--
-- Run this in the Supabase SQL editor.

alter table calls add column transcript jsonb;
alter table calls add column transcript_status text
  check (transcript_status in ('pending', 'ready', 'failed'));

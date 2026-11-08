-- Who can use an organization's shared mailbox (migration 0013), per agent:
--   full  -- the whole mailbox; their mail goes out from the mailbox's address
--   alias -- only mail to or from the agent's alias, sent as the alias
--   none  -- nothing (JETZT agents keep JETZT's original mailbox instead)
-- An agent without a row gets the default: "alias" when their alias is on the
-- mailbox's own domain, otherwise "none". So connecting, say, a Gmail address
-- (which has no aliases) lets no agent in until an admin chooses who can use
-- it. Admins always see the whole mailbox. Changing the shared mailbox to a
-- different address clears the choices.
--
-- Run in the Supabase SQL editor. Runs as one transaction; only adds a table.

begin;

create table mailbox_access (
  mailbox_id uuid not null references mailboxes(id) on delete cascade,
  agent_id uuid not null references agents(id) on delete cascade,
  access text not null check (access in ('full', 'alias', 'none')),
  updated_by text not null,
  updated_at timestamptz not null default now(),
  primary key (mailbox_id, agent_id)
);

create index idx_mailbox_access_agent on mailbox_access(agent_id);

-- Server only: RLS on, no policies.
alter table mailbox_access enable row level security;

commit;

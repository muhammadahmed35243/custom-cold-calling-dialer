-- Mailboxes: each organization can connect one shared mailbox, and each agent
-- their own. Mail (reading, sending, call follow-ups) uses the agent's own
-- mailbox first, then the organization's shared one, then -- for JETZT only --
-- the original SMTP_* mailbox.
--
-- Connected by "Sign in with Google" (a Google refresh token) or by a
-- password / Google app password with SMTP + IMAP settings. The secret is
-- encrypted by the app (AES-256-GCM, MAILBOX_ENCRYPTION_KEY) before it's
-- stored, and never leaves the server.
--
-- Run in the Supabase SQL editor. Runs as one transaction; only adds a table.

begin;

create table mailboxes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  -- Empty: the organization's shared mailbox. Set: that agent's own.
  agent_id uuid references agents(id) on delete cascade,
  kind text not null check (kind in ('google_oauth', 'password')),
  provider text not null,
  email text not null,
  display_name text,
  smtp_host text not null,
  smtp_port int not null check (smtp_port > 0),
  smtp_secure boolean not null,
  imap_host text not null,
  imap_port int not null check (imap_port > 0),
  username text not null,
  secret_encrypted text not null,
  -- reconnect_needed: the password or Google connection stopped working.
  status text not null default 'connected' check (status in ('connected', 'reconnect_needed')),
  last_error text,
  connected_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index idx_mailboxes_org_shared on mailboxes(org_id) where agent_id is null;
create unique index idx_mailboxes_agent on mailboxes(agent_id) where agent_id is not null;

-- Server only: RLS on, no policies.
alter table mailboxes enable row level security;

commit;

-- Messages to JETZT: from the contact form on the public homepage, and from
-- sub admins in the admin portal (change requests, problems, billing). The
-- super admin reads them in the super admin console and gets an email for
-- each one.
--
-- Run in the Supabase SQL editor. Runs as one transaction. Safe while the
-- current app is live: it only adds a table.

begin;

create table contact_messages (
  id uuid primary key default gen_random_uuid(),
  -- 'website': the public contact form; 'admin': the admin portal.
  source text not null check (source in ('website', 'admin')),
  org_id uuid references organizations(id) on delete set null,
  sender_email text not null,
  sender_name text,
  company text,
  phone text,
  category text not null default 'other'
    check (category in ('sales', 'change_request', 'issue', 'billing', 'other')),
  subject text,
  message text not null,
  status text not null default 'new' check (status in ('new', 'in_progress', 'resolved')),
  -- One-way hash of the sender's IP address (website form only), to limit spam.
  ip_hash text,
  email_notified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_contact_messages_created on contact_messages(created_at desc);
create index idx_contact_messages_org on contact_messages(org_id, created_at desc);
create index idx_contact_messages_ip on contact_messages(ip_hash, created_at desc) where ip_hash is not null;

-- Server only: RLS on, no policies.
alter table contact_messages enable row level security;

commit;

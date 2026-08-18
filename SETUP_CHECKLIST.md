# Cold Dialer - Setup Checklist

## Phase 1: Infrastructure Setup

### Supabase
- [ ] Create a Supabase project at https://supabase.com
- [ ] Get these credentials (Project Settings → API):
  - Project URL (e.g., `https://xxxxx.supabase.co`)
  - Anon Key (public, safe for frontend)
  - Service Role Key (private, only for backend)
- [ ] Create a storage bucket:
  - Storage → New bucket
  - Name: `recordings`
  - Visibility: Private
- [ ] Run the database schema:
  - SQL Editor → paste the contents of `supabase/schema.sql` → Run
- [ ] Enable Google as an auth provider:
  - Authentication → Providers → Google → enable, paste in your Google OAuth Client ID/Secret
  - Note the "Callback URL (for OAuth)" Supabase shows you — you'll need it for the Google Cloud Console step below
- [ ] Set URL Configuration (Authentication → URL Configuration):
  - Site URL: your production domain (e.g., `https://dialer.thejetzt.com`)
  - Redirect URLs: add `https://<your-production-domain>/auth/callback`, your Vercel default domain's `/auth/callback`, and `http://localhost:3000/auth/callback` for local dev

### Google OAuth
- [ ] Go to Google Cloud Console: https://console.cloud.google.com
- [ ] Create/select a project → Credentials → Create Credential → OAuth 2.0 Client ID
- [ ] Application type: Web application
- [ ] Authorized redirect URIs — only Supabase's own callback URL is needed here (the app never talks to Google directly):
  ```
  https://<your-project-ref>.supabase.co/auth/v1/callback
  ```
- [ ] Copy the Client ID and Client Secret into Supabase's Google provider settings (previous step)

### Telnyx
- [ ] Sign up at https://telnyx.com
- [ ] Add funds (Billing) — required to purchase a number and place calls
- [ ] Buy a phone number: Numbers → Buy Numbers
- [ ] Create a TeXML Application: Voice → TeXML Applications → Create
  - The "Voice URL" field can be a placeholder — the app passes the actual URL per-call
  - Note the **Connection ID** it generates
- [ ] Assign your purchased number to that TeXML Application (Numbers → My Numbers → select number → set Connection)
- [ ] Get your API Key (API Keys section) — this is `TELNYX_API_KEY`
- [ ] Get your account's Ed25519 public key (Account Settings) — this is `TELNYX_PUBLIC_KEY`, used to verify webhook signatures

Call status updates and the recording webhook are passed directly as
parameters when the app creates a call — there's no separate "configure a
webhook URL" step needed in the Telnyx dashboard.

### Vercel Project
- [ ] Create a new Vercel project from your GitHub repo
- [ ] Once deployed, add your custom domain: Settings → Domains → add `dialer.thejetzt.com` (or your domain)
- [ ] Add the DNS record Vercel shows you at your registrar (typically a CNAME: `dialer` → `cname.vercel.sh`)
- [ ] SSL certificate auto-generates once DNS resolves (usually a few minutes)

## Phase 2: Environment Variables

Fill in `.env.local` (copy from `.env.example`) for local dev, and add the same set in Vercel → Settings → Environment Variables for production:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=

NEXT_PUBLIC_APP_URL=https://dialer.thejetzt.com   # your production domain

TELNYX_API_KEY=
TELNYX_PHONE_NUMBER=+1XXXXXXXXXX
TELNYX_TEXML_CONNECTION_ID=
TELNYX_PUBLIC_KEY=

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

Note: `NEXT_PUBLIC_APP_URL` must point at a domain Telnyx can actually reach —
it's used to build the webhook URLs Telnyx calls back to. It cannot be
`localhost`; test locally with a tunnel (ngrok/localtunnel) or just test
against your Vercel deployment.

## Phase 3: Database & Auth Setup

### Seed Your Admin Agent
- [ ] Supabase → SQL Editor, run:
  ```sql
  INSERT INTO agents (email, phone_number, display_name, role, is_active)
  VALUES ('your@email.com', '+923001234567', 'Your Name', 'admin', true);
  ```
  Phone number must be in E.164 format.

### Verify Supabase Tables
- [ ] Table Editor → confirm `agents` (1 row: you), `leads` (empty), `calls` (empty) all exist

## Phase 4: Local Testing

- [ ] `npm install`
- [ ] `npm run dev`
- [ ] Open http://localhost:3000 → should redirect to `/auth/login`
- [ ] Sign in with your seeded Google account → should land on `/dashboard` (admin) or `/dialer` (agent)
- [ ] Try a different, unseeded Google account → should be rejected

### Test Lead Upload
- [ ] Upload a small CSV, or use "Add Manually" on the dialer page
- [ ] Confirm the lead appears in the pending queue

### Test a Call
- [ ] Click "Call" on a lead → your phone should ring (via Telnyx)
- [ ] Answer → hear the recording-consent message → it dials the lead's number
- [ ] Hang up → set a disposition + notes → Save & Next
- [ ] Confirm the `calls` table in Supabase got a new row with your disposition
- [ ] After ~30s, confirm a recording file appears in Supabase Storage → `recordings` bucket

## Phase 5: Production Deployment

- [ ] Push to GitHub, connect the repo to Vercel (auto-deploys on push)
- [ ] Confirm the domain shows "Ready" under Vercel → Domains
- [ ] Confirm Supabase's Site URL / Redirect URLs include the production domain (Phase 1)
- [ ] Repeat the Phase 4 test flow against the production URL

## Phase 6: Pilot Launch Prep

### Add Additional Agents
```sql
INSERT INTO agents (email, phone_number, display_name, role, is_active)
VALUES
  ('agent1@example.com', '+923001111111', 'Agent One', 'agent', true),
  ('agent2@example.com', '+923002222222', 'Agent Two', 'agent', true);
```

### Agent Onboarding Notes
- Access: your production URL
- Upload leads (CSV or manual add) → click Call → set disposition after each call
- Troubleshooting:
  - "Phone didn't ring" → check the agent's `phone_number` in the `agents` table is correct E.164
  - "Call fails immediately" → check Telnyx account balance and that the number is assigned to the TeXML Application
  - "Recording not showing" → can take up to ~30s; refresh

## Post-Pilot Review

```sql
SELECT lead_id, agent_email, disposition, notes, duration_seconds, created_at
FROM calls
ORDER BY created_at DESC;
```

Recordings: Supabase → Storage → `recordings` bucket.

## Troubleshooting

### "Unauthorized" on login
- Confirm the email exists in `agents` and `is_active = true`
- Confirm Supabase's Redirect URLs allow-list includes the domain you're testing from (otherwise Supabase silently falls back to the Site URL)

### Call doesn't ring
- Check `TELNYX_API_KEY`, `TELNYX_TEXML_CONNECTION_ID`, and `TELNYX_PHONE_NUMBER` are correct
- Check the Telnyx account has funds
- Check the agent's phone number in `agents` is valid E.164

### Call rings but nothing happens after answering
- `NEXT_PUBLIC_APP_URL` likely doesn't resolve (points at an undeployed domain, or a dead tunnel) — Telnyx can't reach `/api/calls/connect`
- Check Vercel function logs for the `/api/calls/connect` request

### Recording not downloading
- Webhook signature verification failing → check `TELNYX_PUBLIC_KEY` is correct
- Supabase Storage upload failing → check bucket exists and the service key is correct

### Domain not resolving
- DNS record not yet propagated (wait 10-30 min)
- Vercel domain verification not complete (check Vercel → Domains)
- SSL not yet issued (auto-issues once DNS resolves, usually within minutes)

## Done!

Once you've completed this checklist, your dialer is ready for pilot testing. Invite agents, upload leads, and start calling!

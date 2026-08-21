<p align="center">
  <img src=".github/assets/banner.svg" alt="JETZT Dialer" width="100%" />
</p>

<p align="center">
  A production cold-calling workspace built with Next.js, TypeScript, Telnyx, and Supabase.
  <br />
  Call by phone bridge or straight from the browser, track every disposition, and follow up by email — all in one place.
</p>

## Features

- 🔐 **Google OAuth** (via Supabase Auth) with an allow-list of seeded agents
- ☎️ **Two calling modes, agent's choice:**
  - **Phone bridge** — Telnyx rings the agent's own phone first, then bridges to the lead
  - **Browser calling (WebRTC)** — agent calls straight from the tab using their computer's mic/speaker, no phone involved
- 🔢 **Self-service phone number** — agents set/update their own number for phone-bridge mode, no admin needed
- 🎙️ **Every call recorded**, phone-bridge or browser — downloaded off Telnyx and stored in Supabase Storage, played back via signed URLs
- 📋 **Lead upload from `.csv`, `.xlsx`, or `.xls`** — recognizes common header variations (`Lead Name`, `Phone Number`, `Niche`, ...) and keeps anything else in the sheet as notes; phone numbers are validated and normalized to E.164 across multiple regions
- 📊 **Call tracking**: dispositions (connected / voicemail / no-answer / busy / callback), notes, callback scheduling
- 📧 **Mail** — a shared team mailbox (IMAP/SMTP) built in, so an agent can send a follow-up email straight from a call record; each agent only sees mail tied to their own alias
- 🔔 Real-time call status polling
- 👤 **Admin dashboard** for managing agents and reviewing every call across the team
- ✨ Consistent branded loading screen across every page transition, not just the first load

## Setup

### Prerequisites

- Node.js 18+
- A Telnyx account with:
  - A purchased phone number
  - A TeXML Connection (phone-bridge calling)
  - A Credential Connection (browser/WebRTC calling)
- A Supabase project (Auth + Database + Storage)
- Google OAuth credentials (configured as a provider in Supabase Auth)
- (Optional) A mailbox with IMAP/SMTP access, for the Mail feature

### Local Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   Copy `.env.example` to `.env.local` and fill in your credentials:
   ```bash
   cp .env.example .env.local
   ```

3. **Set up Supabase:**
   - Create a Supabase project
   - Run the schema: `supabase/schema.sql`
   - Enable the Google provider under Authentication → Providers
   - Under Authentication → URL Configuration, set Site URL and add your app's `/auth/callback` URLs to the redirect allow-list

4. **Seed an agent in Supabase:**
   ```sql
   INSERT INTO agents (email, phone_number, display_name, role, is_active)
   VALUES ('your@email.com', '+923001234567', 'Your Name', 'admin', true);
   ```

5. **Run the dev server:**
   ```bash
   npm run dev
   ```

6. **Open http://localhost:3000** and sign in with your Google account.

## Project Structure

```
app/
├─ auth/login/            # Google sign-in page
├─ auth/callback/         # Post-OAuth role routing
├─ dashboard/             # Admin landing page (choose Admin vs Dialer)
├─ admin/                 # Admin dashboard: all calls, agent management
├─ dialer/                # Agent dialer UI: lead queue, call controls, phone/browser toggle
├─ mail/                  # Shared mailbox UI (read + send, per-agent alias filtering)
├─ api/
│  ├─ calls/              # Call initiation, Telnyx webhooks, recording linking
│  ├─ leads/              # Lead upload, manual add, & disposition
│  ├─ agents/              # Self-service + admin agent management
│  ├─ mail/               # IMAP/SMTP endpoints backing the Mail page
│  └─ webrtc-credentials/ # Issues short-lived WebRTC login to authenticated agents

lib/
├─ api-auth.ts           # Bearer-token auth helper for API routes
├─ telnyx.ts             # Telnyx call initiation, TeXML builders, Call Control actions, webhook signature verification
├─ mailer.ts             # IMAP read + SMTP send for the Mail feature
├─ supabase.ts           # Supabase clients (browser + service role)
├─ phone.ts              # Phone validation/normalization (libphonenumber-js, multi-region)
├─ csv-parser.ts         # Lead sheet parsing: flexible header aliases, extra columns folded into notes
└─ storage.ts            # Recording download/upload to Supabase Storage (shared by both calling modes)

components/
├─ AppHeader.tsx          # Shared nav (Dialer / Admin / Mail) used across every page
├─ SplashScreen.tsx       # Cold-load splash (branded loader + minimum display time)
├─ BrandedLoader.tsx      # The branded loading view itself, reused by every page's own loading state
├─ Avatar.tsx, StatusBadge.tsx, StatRow.tsx, icons.tsx   # Shared design-system pieces

supabase/
└─ schema.sql            # Database schema + RLS policies
```

## Lead Upload Format

Upload a `.csv`, `.xlsx`, or `.xls` file. Only a name and a phone number column are required — header names are matched flexibly (case-insensitive, common variations recognized):

| Field | Recognized headers (examples) |
|---|---|
| Name (required) | `name`, `lead name`, `full name`, `business name` |
| Phone (required) | `phone`, `phone number`, `mobile`, `contact number` |
| Email (optional) | `email`, `email address` |
| Company (optional) | `company`, `niche`, `business`, `industry` |

Anything else in the sheet (city, website, discovery source, pitched service, ...) isn't dropped — it's kept as labeled lines in the lead's notes, so the agent still sees that context before calling. Blank-ish values (`N/A`, `-`, empty) are treated as empty rather than stored literally.

Phone numbers can be in any common format; they're normalized to E.164. Numbers with an explicit country code (with or without a leading `+`) are recognized directly; bare local numbers fall back to whichever regions this deployment actually serves.

Leads can also be added one at a time from the dialer page ("Add Manually").

## Calling Flow

Every lead can be called either way — the agent picks per session with a Phone/Browser toggle.

### Phone bridge
1. Agent clicks "Call" on a lead
2. Telnyx rings the agent's own phone first (number the agent set for themselves)
3. Agent answers
4. Telnyx bridges the agent to the lead's number (using the Telnyx number as caller ID), after a recording-consent notice
5. Recording auto-downloads to Supabase Storage once the call ends

### Browser (WebRTC)
1. Agent clicks "Call" — audio goes through the browser tab via the agent's mic/speaker, no phone involved
2. Telnyx's Call Control layer answers the lead's leg directly; the browser call round-trips the app's own call-record id through Telnyx's `client_state` so the two sides can be linked reliably
3. Recording starts server-side once Telnyx confirms the leg answered, using the same download-and-store pipeline as phone-bridge calls

Either way, once the call ends the agent marks a disposition (connected/voicemail/no-answer/busy/callback) with notes, and the queue advances to the next pending lead.

## Mail

A lightweight shared inbox built into the app, so follow-ups don't require leaving the dialer:

- Reads and sends through one shared mailbox account (IMAP + SMTP)
- Each agent can have an alias address (`agents.alias_email`); when set, their Mail view is filtered to messages involving that address, while sent mail still goes out under their own name
- Compose a follow-up straight from a call record in the dialer's call history
- Sent mail is filed back into the mailbox's own Sent folder (plain SMTP submission doesn't do this automatically)

## Database Schema

Three main tables:

- **agents**: email, phone_number, display_name, role (admin/agent), is_active, alias_email
- **leads**: name, phone, email, company, notes, status, assigned_agent, uploaded_batch_id
- **calls**: lead_id, agent_email, twilio_call_sid (holds the Telnyx call/call-control id), agent_call_status, lead_call_status, disposition, recording_url, callback_at, etc.

See `supabase/schema.sql` for full details and RLS policies.

## Security

- Google OAuth via Supabase Auth (only seeded emails in the `agents` table can access the app)
- Telnyx webhook signature verification (Ed25519, against Telnyx's public key) on both the TeXML and Call Control webhook paths
- API routes verify the caller's Supabase session via a Bearer token
- WebRTC credentials are issued to authenticated agents from a server route, never bundled into the public JS
- Row Level Security on all tables (agents see only their own calls + the pending queue; admins see everything)

## Deployment

1. Push to GitHub
2. Connect repo to Vercel
3. Add environment variables in Vercel dashboard (see `.env.example`)
4. Vercel auto-deploys on push
5. Add your custom domain in Vercel's Domains settings
6. Update DNS at your registrar per Vercel's instructions (typically a CNAME)
7. Update Supabase Auth's Site URL / Redirect URLs to match your production domain

## Known Limitations (v1)

- No auto-dial-next (manual queue advancement)
- No built-in QA dashboard (review recordings/data manually)
- No callback reminders (stored, not enforced)
- No call transfer, conferencing, or supervisor listening

## Future Enhancements

- Call analytics on the admin dashboard
- Callback scheduler with automated reminders
- Call transcription (speech-to-text)
- Do-not-call list enforcement
- CRM integration (sync outcomes)

## Contact

- **contact@thejetzt.com** — new requirements, feature requests, anything you need added
- **support@thejetzt.com** — something's broken in the dialer

## License

Proprietary.

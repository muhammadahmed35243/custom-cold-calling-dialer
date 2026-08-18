# Cold-Calling Dialer

A production-grade cold-calling dialer app built with Next.js, TypeScript, Telnyx, and Supabase.

## Features

- 🔐 Google OAuth authentication (via Supabase Auth) with allow-list control
- 📞 Phone-bridge calling: Telnyx rings agent first, then bridges to lead
- 📋 CSV lead upload with phone validation (E.164 format), plus manual single-lead entry
- 📊 Call tracking: dispositions (connected/voicemail/no-answer/busy/callback)
- 🎙️ Full call recording ownership (downloaded to Supabase Storage)
- 📝 Call notes and callback scheduling
- 🔔 Real-time call status polling
- 👤 Admin dashboard for managing agents and reviewing all calls

## Setup

### Prerequisites

- Node.js 18+
- Telnyx account with a purchased phone number and a TeXML Application
- Supabase project (Auth + Database + Storage)
- Google OAuth credentials (configured as a provider in Supabase Auth)

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
├─ dialer/                # Agent dialer UI: lead queue, call controls
├─ api/
│  ├─ calls/              # Call initiation & Telnyx webhooks
│  └─ leads/              # Lead upload, manual add, & disposition

lib/
├─ api-auth.ts           # Bearer-token auth helper for API routes
├─ telnyx.ts             # Telnyx call initiation, TeXML builders, webhook signature verification
├─ supabase.ts           # Supabase clients (browser + service role)
├─ phone.ts              # Phone validation (libphonenumber-js)
├─ csv-parser.ts         # CSV parsing
└─ storage.ts            # Recording download/upload to Supabase Storage

supabase/
└─ schema.sql            # Database schema + RLS policies
```

## CSV Format

Upload leads with this format (headers required):
```
name,phone,company,notes
John Doe,+923001234567,Acme Corp,Interested in demo
Jane Smith,0333-123-4567,TechCo,Follow up Monday
```

Columns:
- `name` (required): Lead name
- `phone` (required): Phone number (any format, converted to E.164)
- `company` (optional): Company name
- `notes` (optional): Notes about the lead

Leads can also be added one at a time from the dialer page ("Add Manually").

## Calling Flow

1. Agent logs in with Google
2. Agent uploads a CSV of leads, or adds one manually
3. Agent clicks "Call" on a lead
4. **Telnyx rings the agent's phone first** (number stored in `agents` table)
5. Agent answers
6. Telnyx bridges the agent to the **lead's number** (using your Telnyx number as caller ID), after playing a recording-consent notice
7. After the call ends, agent marks a disposition (connected/voicemail/no-answer/busy/callback) with notes
8. Recording auto-downloads to Supabase Storage
9. Queue advances to the next pending lead

Call status updates and the recording webhook are both passed directly as
parameters on call creation (`StatusCallback`, `recordingStatusCallback`) —
no manual webhook configuration is needed in the Telnyx dashboard.

## Database Schema

Three main tables:

- **agents**: email, phone_number, display_name, role (admin/agent), is_active
- **leads**: name, phone, company, notes, status, assigned_agent, uploaded_batch_id
- **calls**: lead_id, agent_email, twilio_call_sid (holds the Telnyx call SID), agent_call_status, lead_call_status, disposition, recording_url, etc.

See `supabase/schema.sql` for full details and RLS policies.

## Security

- Google OAuth via Supabase Auth (only seeded emails in the `agents` table can access the app)
- Telnyx webhook signature verification (Ed25519, against Telnyx's public key)
- API routes verify the caller's Supabase session via a Bearer token
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
- No call transfer or conferencing
- No supervisor listening

## Future Enhancements

- Call analytics on the admin dashboard
- Callback scheduler with automated reminders
- Call transcription (speech-to-text)
- Do-not-call list enforcement
- CRM integration (sync outcomes)

## Support

For issues, check:
1. Telnyx portal call logs for call failures
2. Supabase logs for database/auth errors
3. Browser console + Network tab for frontend errors
4. Vercel function logs for API route errors

## License

Proprietary.

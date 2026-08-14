# Cold-Calling Dialer

A production-grade cold-calling dialer app built with Next.js, TypeScript, Twilio, and Supabase.

## Features

- 🔐 Google OAuth authentication with allow-list control
- 📞 Phone-bridge calling: Twilio rings agent first, then bridges to lead
- 📋 CSV lead upload with phone validation (E.164 format)
- 📊 Call tracking: dispositions (connected/voicemail/no-answer/busy/callback)
- 🎙️ Full call recording ownership (downloaded to Supabase Storage)
- 📝 Call notes and callback scheduling
- 🔔 Real-time call status polling

## Setup

### Prerequisites

- Node.js 18+
- Twilio account with a purchased phone number
- Supabase project
- Google OAuth credentials

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
   - Seed an agent: insert your email + phone into the `agents` table

4. **Seed an agent in Supabase:**
   ```sql
   INSERT INTO agents (email, phone_number, display_name) 
   VALUES ('your@email.com', '+923001234567', 'Your Name');
   ```

5. **Run the dev server:**
   ```bash
   npm run dev
   ```

6. **Open http://localhost:3000** and sign in with your Google account.

## Project Structure

```
app/
├─ (auth)/login/          # Google sign-in page
├─ dialer/                # Main dialer UI
├─ api/
│  ├─ auth/[...nextauth]/ # NextAuth routes
│  ├─ calls/              # Call initiation & webhooks
│  └─ leads/              # Lead upload & disposition
└─ middleware.ts          # Route protection

lib/
├─ auth.ts               # NextAuth config
├─ twilio.ts             # Twilio helpers
├─ supabase.ts           # Supabase client
├─ phone.ts              # Phone validation
├─ csv-parser.ts         # CSV parsing
└─ storage.ts            # File storage

supabase/
└─ schema.sql            # Database schema
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

## Calling Flow

1. Agent logs in with Google
2. Agent uploads CSV of leads
3. Agent clicks "Call" on a lead
4. **Twilio rings agent's phone first** (stored in `agents` table)
5. Agent answers
6. Twilio bridges agent to the **lead's number** (using your Twilio number as caller ID)
7. After call ends, agent marks disposition (connected/voicemail/no-answer/etc)
8. Recording auto-downloads to Supabase Storage
9. Next lead auto-advances

## Twilio Webhooks

Configure these in your Twilio account:

**Status Callback (Voice Calls):**
```
https://dialer.thejetzt.com/api/calls/status
```

**Recording Status Callback:**
```
https://dialer.thejetzt.com/api/calls/recording
```

## Database Schema

Three main tables:

- **agents**: email, phone_number, display_name, is_active
- **leads**: name, phone, company, notes, status, assigned_agent, uploaded_batch_id
- **calls**: lead_id, agent_email, twilio_call_sid, agent_call_status, lead_call_status, disposition, recording_url, etc.

See `supabase/schema.sql` for full details.

## Security

- Google OAuth with allow-list (only seeded emails can sign in)
- Twilio webhook signature verification
- Session-based route protection
- Phone numbers encrypted at rest (future enhancement)

## Deployment

1. Push to GitHub
2. Connect repo to Vercel
3. Add environment variables in Vercel dashboard
4. Vercel auto-deploys on push
5. Update DNS: add CNAME `dialer` → `cname.vercel.sh`
6. Verify domain in Vercel

## Known Limitations (v1)

- No auto-dial-next (manual queue advancement)
- No built-in QA dashboard (review recordings/data manually)
- No callback reminders (stored, not enforced)
- No call transfer or conferencing
- No supervisor listening

## Future Enhancements

- Admin dashboard (call analytics, recording playback)
- Callback scheduler with automated reminders
- Call transcription (speech-to-text)
- Multi-agent supervisor role
- Do-not-call list enforcement
- CRM integration (sync outcomes)

## Support

For issues, check:
1. Twilio logs for call failures
2. Supabase logs for database errors
3. Browser console for frontend errors
4. NextAuth session on `/api/auth/signin`

## License

Proprietary.

# Cold Dialer - Setup Checklist

## Phase 1: Infrastructure Setup

### DNS & Domain
- [ ] Log into your domain registrar (where thejetzt.com is registered)
- [ ] Add CNAME record:
  - **Name:** `dialer`
  - **Value:** `cname.vercel.sh`
  - **TTL:** 3600 (or default)
  - Wait 5-30 minutes for propagation

### Vercel Project
- [ ] Create new Vercel project OR add to existing
- [ ] Go to Settings → Domains
- [ ] Add domain: `dialer.thejetzt.com`
- [ ] Vercel will auto-verify the DNS CNAME
- [ ] SSL certificate will auto-generate (may take 5-10 min)

### Supabase
- [ ] Create new Supabase project at https://supabase.com
- [ ] Get these credentials (in project settings):
  - Project URL (e.g., `https://xxxxx.supabase.co`)
  - Anon Key (public, safe for frontend)
  - Service Role Key (private, only for backend)
- [ ] Create a storage bucket:
  - Go to Storage → New bucket
  - Name: `recordings`
  - Visibility: Private
- [ ] Run the database schema:
  - Go to SQL Editor
  - Open `supabase/schema.sql`
  - Copy and paste entire SQL file
  - Run query

### Twilio
- [ ] Log in to Twilio Console
- [ ] Get these credentials (in Account Info):
  - Account SID
  - Auth Token
- [ ] Purchase a phone number:
  - Go to Phone Numbers → Buy Numbers
  - Choose country (Pakistan if calling Pakistani numbers)
  - Note the number (format: +1XXXXXXXXXX or similar)
- [ ] Configure webhooks:
  - Go to Phone Number → Manage Phone Numbers
  - Select your number
  - Scroll to "Voice & Fax"
  - **Status Callback URL (when call ends):**
    ```
    https://dialer.thejetzt.com/api/calls/status
    ```
  - **Recording Status Callback:**
    ```
    https://dialer.thejetzt.com/api/calls/recording
    ```
  - **When Call Completes:** select POST
  - Save

### Google OAuth
- [ ] Go to Google Cloud Console: https://console.cloud.google.com
- [ ] Create a new project OR select existing
- [ ] Enable "Google+ API"
- [ ] Go to Credentials → Create Credential → OAuth 2.0 Client ID
- [ ] Application type: Web application
- [ ] Authorized redirect URIs:
  ```
  https://dialer.thejetzt.com/api/auth/callback/google
  http://localhost:3000/api/auth/callback/google
  ```
- [ ] Copy:
  - Client ID
  - Client Secret

## Phase 2: Environment Setup

### Local Development (.env.local)
- [ ] Copy `.env.example` to `.env.local`
- [ ] Fill in all variables:
  ```
  GOOGLE_CLIENT_ID=                    # From Google Cloud
  GOOGLE_CLIENT_SECRET=                # From Google Cloud
  NEXTAUTH_SECRET=                     # Generate random: `openssl rand -base64 32`
  NEXTAUTH_URL=https://dialer.thejetzt.com
  
  TWILIO_ACCOUNT_SID=                  # From Twilio
  TWILIO_AUTH_TOKEN=                   # From Twilio
  TWILIO_PHONE_NUMBER=+1XXXXXXXXXX     # Your Twilio number
  
  NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
  NEXT_PUBLIC_SUPABASE_ANON_KEY=       # Supabase anon key
  SUPABASE_SERVICE_KEY=                # Supabase service role key
  ```

### Vercel Environment Variables
- [ ] Go to Vercel project → Settings → Environment Variables
- [ ] Add each variable from `.env.local` (except localhost URLs)
  - GOOGLE_CLIENT_ID
  - GOOGLE_CLIENT_SECRET
  - NEXTAUTH_SECRET (same as local)
  - NEXTAUTH_URL = `https://dialer.thejetzt.com`
  - TWILIO_ACCOUNT_SID
  - TWILIO_AUTH_TOKEN
  - TWILIO_PHONE_NUMBER
  - NEXT_PUBLIC_SUPABASE_URL
  - NEXT_PUBLIC_SUPABASE_ANON_KEY
  - SUPABASE_SERVICE_KEY

## Phase 3: Database & Auth Setup

### Seed Your Agent
- [ ] Go to Supabase → SQL Editor
- [ ] Run this query (replace with your details):
  ```sql
  INSERT INTO agents (email, phone_number, display_name)
  VALUES (
    'your@email.com',
    '+923001234567',
    'Your Name'
  );
  ```
  **Note:** phone_number must be in E.164 format (international)

### Verify Supabase Tables
- [ ] Go to Supabase → Table Editor
- [ ] Verify these tables exist:
  - `agents` (should have 1 row: you)
  - `leads` (empty initially)
  - `calls` (empty initially)

## Phase 4: Local Testing

### Install & Run
- [ ] `npm install` (already done)
- [ ] `npm run dev`
- [ ] Open http://localhost:3000
- [ ] You should be redirected to /auth/login

### Test Login
- [ ] Click "Sign in with Google"
- [ ] Use your seeded email
- [ ] Should redirect to /dialer
- [ ] Try logging out and in with a different email → should be rejected (not in allow-list)

### Test CSV Upload
- [ ] Prepare a small CSV file (2-3 leads):
  ```
  name,phone,company,notes
  Test Lead,+923001234567,Test Corp,Test notes
  Another Lead,0333-123-4567,Another Co,More notes
  ```
- [ ] Upload it on the dialer page
- [ ] Should see "✓ 2 leads imported"
- [ ] Leads should appear in the queue

### Test Call (with dummy/test number)
- [ ] Click "Call" on a lead
- [ ] Your phone should ring (using Twilio)
- [ ] Answer the call
- [ ] You should hear: "This call is being recorded for quality assurance and training purposes"
- [ ] Then it will attempt to dial the lead number (if real)
- [ ] For testing, hang up after hearing the compliance message
- [ ] Back in the app, select a disposition (e.g., "Connected")
- [ ] Add notes
- [ ] Click "Save & Next"
- [ ] Verify Supabase `calls` table has a new row with your disposition

### Test Recording Storage
- [ ] After a completed call, wait 30 seconds
- [ ] Go to Supabase → Storage → recordings
- [ ] Should see a file like `recordings/2024/08/call_xxxxx.mp3`
- [ ] Download it, verify it's an MP3 file

## Phase 5: Production Deployment

### Deploy to Vercel
- [ ] Push code to GitHub:
  ```bash
  git init
  git add .
  git commit -m "Initial dialer app"
  git branch -M main
  git remote add origin https://github.com/YOUR_ORG/dialer.git
  git push -u origin main
  ```
- [ ] Connect GitHub repo to Vercel project
- [ ] Vercel auto-deploys on push

### Verify Production
- [ ] Navigate to https://dialer.thejetzt.com
- [ ] HTTPS lock visible (green)
- [ ] Google login works
- [ ] Can upload CSV
- [ ] Can place a real call to test number (or your phone again)
- [ ] Recording appears in Supabase Storage

### Configure Google OAuth for Production
- [ ] Update Google Cloud Console:
  - Go to Credentials
  - Edit your OAuth client
  - Add authorized redirect URI:
    ```
    https://dialer.thejetzt.com/api/auth/callback/google
    ```

## Phase 6: Pilot Launch Prep

### Prepare Agent Onboarding
- [ ] Document how to:
  - Access the dialer (https://dialer.thejetzt.com)
  - Upload a CSV
  - Make a call
  - Set disposition & notes
  - Save and advance to next lead
- [ ] Provide troubleshooting guide:
  - "Phone didn't ring" → check phone number format in agents table
  - "Call dropped" → check Twilio balance/account
  - "Recording not showing" → may take 30 seconds, refresh page

### Add Pilot Agents (when ready)
- [ ] In Supabase, insert additional agents:
  ```sql
  INSERT INTO agents (email, phone_number, display_name)
  VALUES 
    ('agent1@example.com', '+923001111111', 'Agent One'),
    ('agent2@example.com', '+923002222222', 'Agent Two');
  ```

### Prepare Test Lead CSV
- [ ] Create a CSV with test leads (use real numbers if testing with real agents)
- [ ] Upload to dialer
- [ ] Agents can start calling

## Post-Pilot Review

### Access Call Data
- [ ] Go to Supabase → SQL Editor
- [ ] Query call history:
  ```sql
  SELECT lead_id, agent_email, disposition, notes, duration_seconds, created_at
  FROM calls
  ORDER BY created_at DESC;
  ```

### Listen to Recordings
- [ ] Go to Supabase → Storage → recordings
- [ ] Click any recording file
- [ ] Download and listen

### Analyze Metrics
- [ ] Calls per agent
- [ ] Connect rate (connected vs no-answer/voicemail)
- [ ] Average call duration
- [ ] Callback follow-ups needed

## Troubleshooting

### "Unauthorized" on login
- Check email is in `agents` table
- Verify agent's `is_active` is true

### Call doesn't ring
- Check Twilio Account SID/Auth Token are correct
- Check TWILIO_PHONE_NUMBER is valid and purchased
- Check agent's phone number in `agents` table is E.164 format

### Recording not downloading
- Twilio webhook signature verification failing → check TWILIO_AUTH_TOKEN
- Recording URL invalid → check Twilio logs
- Supabase Storage upload failing → check bucket permissions, service key

### Domain not resolving
- DNS CNAME not yet propagated (wait 10-30 min)
- Vercel domain verification not complete (check Vercel → Domains)
- SSL not yet issued (Vercel does this auto, may take 10 min)

## Done!

Once you've completed this checklist, your dialer is ready for pilot testing. Invite agents, upload leads, and start calling!

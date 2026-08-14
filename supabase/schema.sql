-- Create agents table
CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  phone_number TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role VARCHAR(10) CHECK (role IN ('admin', 'agent')) DEFAULT 'agent',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create leads table
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  company TEXT,
  notes TEXT,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'called', 'callback')),
  assigned_agent TEXT,
  uploaded_batch_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create calls table
CREATE TABLE calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  agent_email TEXT NOT NULL,
  twilio_call_sid TEXT,
  agent_call_status VARCHAR(20) CHECK (agent_call_status IN ('ringing', 'no_answer', 'completed', 'failed')),
  lead_call_status VARCHAR(20) CHECK (lead_call_status IN ('queued', 'ringing', 'completed', 'no_answer', 'failed')),
  started_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  agent_answered_at TIMESTAMP WITH TIME ZONE,
  lead_answered_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE,
  duration_seconds INT,
  disposition VARCHAR(20) CHECK (disposition IN ('connected', 'voicemail', 'no_answer', 'busy', 'callback')),
  notes TEXT,
  recording_sid TEXT,
  recording_storage_path TEXT,
  recording_url TEXT,
  recording_size_bytes INT,
  recording_uploaded_at TIMESTAMP WITH TIME ZONE,
  recording_expires_at TIMESTAMP WITH TIME ZONE,
  callback_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_assigned_agent ON leads(assigned_agent);
CREATE INDEX idx_calls_agent_email ON calls(agent_email);
CREATE INDEX idx_calls_twilio_call_sid ON calls(twilio_call_sid);
CREATE INDEX idx_calls_created_at ON calls(created_at);
CREATE INDEX idx_leads_created_at ON leads(created_at);

-- Enable Row Level Security
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;

-- Agents table policies
-- NOTE: agents has no sensitive data (email/phone/name/role only), so reads are
-- public. A policy that checks "is the requester an admin?" via a subquery on
-- this SAME table causes infinite recursion in Postgres RLS — avoid that pattern.
CREATE POLICY "Public read agents" ON agents
  FOR SELECT USING (true);

CREATE POLICY "Authenticated insert agents" ON agents
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated update agents" ON agents
  FOR UPDATE USING (auth.role() = 'authenticated');

-- Leads table policies
CREATE POLICY "Authenticated users can view pending leads" ON leads
  FOR SELECT USING (
    status = 'pending' AND
    EXISTS (
      SELECT 1 FROM agents WHERE email = auth.jwt() ->> 'email' AND is_active = true
    )
  );

CREATE POLICY "Agents can update leads status" ON leads
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM agents WHERE email = auth.jwt() ->> 'email' AND is_active = true
    )
  );

-- Calls table policies
CREATE POLICY "Agents can view their own calls" ON calls
  FOR SELECT USING (agent_email = auth.jwt() ->> 'email');

CREATE POLICY "Admin can view all calls" ON calls
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM agents WHERE email = auth.jwt() ->> 'email' AND role = 'admin'
    )
  );

CREATE POLICY "Agents can insert calls" ON calls
  FOR INSERT WITH CHECK (
    agent_email = auth.jwt() ->> 'email' AND
    EXISTS (
      SELECT 1 FROM agents WHERE email = auth.jwt() ->> 'email' AND is_active = true
    )
  );

CREATE POLICY "Agents can update their own calls" ON calls
  FOR UPDATE USING (agent_email = auth.jwt() ->> 'email');

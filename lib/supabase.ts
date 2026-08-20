import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// Client-side Supabase instance (safe to use in browser)
export const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

// Alias for auth operations (same as supabaseClient but clearer intent)
export const supabaseAuth = supabaseClient;

// Server-side Supabase instance (service role, bypasses RLS).
// This module is imported by both client components and server route
// handlers. Next.js strips non-NEXT_PUBLIC_ env vars from the client
// bundle, so process.env.SUPABASE_SERVICE_KEY is always undefined in the
// browser — the typeof window check below is a second layer, not the only
// thing preventing the service key from reaching client code.
export const supabaseServiceClient = (() => {
  // Try to get service client only if running on server
  if (typeof window === "undefined" && process.env.SUPABASE_SERVICE_KEY) {
    return createClient(supabaseUrl, process.env.SUPABASE_SERVICE_KEY);
  }
  // Fallback to anon key if running on client
  return supabaseClient;
})();

export type Agent = {
  id: string;
  email: string;
  phone_number: string;
  display_name: string;
  role: "admin" | "agent";
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Lead = {
  id: string;
  name: string;
  phone: string;
  company: string | null;
  notes: string | null;
  status: "pending" | "in_progress" | "called" | "callback";
  assigned_agent: string | null;
  uploaded_batch_id: string | null;
  created_at: string;
  updated_at: string;
};

export type Call = {
  id: string;
  lead_id: string;
  agent_email: string;
  twilio_call_sid: string | null;
  agent_call_status: string | null;
  lead_call_status: string | null;
  started_at: string;
  agent_answered_at: string | null;
  lead_answered_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  disposition: string | null;
  notes: string | null;
  recording_sid: string | null;
  recording_storage_path: string | null;
  recording_url: string | null;
  recording_size_bytes: number | null;
  recording_uploaded_at: string | null;
  recording_expires_at: string | null;
  callback_at: string | null;
  created_at: string;
  updated_at: string;
  leads?: { id: string; name: string; phone: string } | null;
};

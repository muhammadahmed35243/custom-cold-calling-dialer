export type AgentConfig = { key: string; value: string; updated_at: string };

export type KnowledgeBaseEntry = {
  id: string;
  content: string;
  source: string | null;
  created_at: string;
};

export type Insight = {
  id: string;
  kind: "kb_fact" | "instruction_change";
  content: string;
  status: "pending" | "approved" | "rejected" | "auto_applied";
  source_call_id: string | null;
  created_at: string;
  resolved_at: string | null;
};

export type TranscriptTurn = { role: "caller" | "agent"; text: string; at: string };

export type VoiceAgentCall = {
  id: string;
  call_control_id: string;
  caller_phone: string | null;
  started_at: string;
  ended_at: string | null;
  transcript: TranscriptTurn[];
  recording_url: string | null;
  outcome: string | null;
};

export type FallbackMessage = {
  id: string;
  call_control_id: string | null;
  caller_phone: string | null;
  message: string;
  contact_email: string;
  status: "open" | "responded";
  created_at: string;
};

export type CalendlyBooking = {
  id: string;
  caller_phone: string;
  event_uuid: string;
  invitee_name: string | null;
  invitee_email: string | null;
  scheduled_time: string | null;
  status: "booked" | "cancelled";
  created_at: string;
};

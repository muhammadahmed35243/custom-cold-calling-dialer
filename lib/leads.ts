import { supabaseServiceClient } from "./supabase";

// The lead lifecycle (migration 0011):
//
//   pending      waiting in the queue
//   in_progress  being called right now (locked to one agent)
//   callback     a follow-up call is scheduled
//   called       done
//
// A call moves its lead to in_progress. When the call ends the lead is
// released straight away -- agents don't have to save an outcome for the
// queue to keep moving -- and an outcome saved later still decides.

// Leads that weren't reached go back in the queue until tried this many times.
export const MAX_CALL_ATTEMPTS = 3;

export type ReleasedStatus = "pending" | "called" | "callback";

// Where a lead goes after a call. The agent's outcome decides when there is
// one; without one, a lead who answered is done. Anyone not reached (no
// answer, busy, voicemail, didn't connect) is tried again later.
export function statusAfterCall(disposition: string | null, answered: boolean, attempts: number): ReleasedStatus {
  if (disposition === "callback") return "callback";
  if (disposition === "connected") return "called";
  if (!disposition && answered) return "called";
  return attempts >= MAX_CALL_ATTEMPTS ? "called" : "pending";
}

type CallFacts = {
  lead_call_status: string | null;
  twilio_call_sid: string | null;
  lead_leg_seconds: number | null;
  lead_answered_at: string | null;
};

const CALL_FACTS = "lead_call_status, twilio_call_sid, lead_leg_seconds, lead_answered_at";

// Did the call ring the lead's phone? A phone-bridge call where the agent
// never picked up their own phone never dialed the lead at all.
export function wasDialed(call: CallFacts): boolean {
  return !!call.lead_call_status || !!call.twilio_call_sid || call.lead_leg_seconds != null;
}

export function wasAnswered(call: CallFacts): boolean {
  return call.lead_call_status === "completed" || (call.lead_leg_seconds ?? 0) > 0 || !!call.lead_answered_at;
}

// The lead's calls, newest first, with what's needed to judge them.
async function leadCalls(leadId: string) {
  const { data, error } = await supabaseServiceClient
    .from("calls")
    .select(`id, created_at, disposition, ${CALL_FACTS}`)
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Couldn't read the lead's calls: ${error.message}`);
  return (data || []) as (CallFacts & { id: string; created_at: string; disposition: string | null })[];
}

// Moves a lead on according to its latest call: called when the agent saves an
// outcome (`disposition`), and when a call ends without one (`disposition`
// undefined: only a lead still in_progress is moved, so an outcome the agent
// already saved stands). An older call never moves the lead -- re-editing a
// past call, or a late webhook, mustn't undo a newer call. `answeredHint` is
// the browser's own view, used when Telnyx's answer event hasn't landed yet.
export async function moveLeadAfterCall(
  callId: string,
  opts: { disposition?: string | null; answeredHint?: boolean } = {}
): Promise<ReleasedStatus | null> {
  const { data: call } = await supabaseServiceClient
    .from("calls")
    .select(`id, lead_id, created_at, disposition, ${CALL_FACTS}`)
    .eq("id", callId)
    .maybeSingle();
  if (!call) return null;

  const history = await leadCalls(call.lead_id);
  if (!history.length || history[0].id !== call.id) return null;

  const disposition = opts.disposition !== undefined ? opts.disposition : call.disposition;
  const answered = wasAnswered(call) || !!opts.answeredHint;
  const attempts = history.filter(wasDialed).length;
  const status = statusAfterCall(disposition, answered, attempts);

  let update = supabaseServiceClient
    .from("leads")
    .update({
      status,
      assigned_agent: null,
      ...(wasDialed(call) ? { last_called_at: call.created_at } : {}),
    })
    .eq("id", call.lead_id);
  // Releasing at the end of a call only applies to a lead still locked by it.
  if (opts.disposition === undefined) update = update.eq("status", "in_progress");

  const { error } = await update;
  if (error) throw new Error(`Couldn't update the lead: ${error.message}`);
  return status;
}

// A call that hasn't reported an end after this long is treated as over (a
// lost webhook, a browser closed mid-call). Generous, so a long sales call is
// never cut loose while it's still going.
const STALE_CALL_MS = 3 * 60 * 60 * 1000;

// Safety net for leads left "in progress" when a call's end never reached us:
// releases the agent's (or, for an admin, the organization's) leads whose
// latest call has ended or gone stale. Returns how many were released.
export async function releaseStuckLeads(orgId: string, agentEmail?: string): Promise<number> {
  let query = supabaseServiceClient.from("leads").select("id").eq("org_id", orgId).eq("status", "in_progress");
  if (agentEmail) query = query.eq("assigned_agent", agentEmail);
  const { data: stuck, error } = await query.limit(500);
  if (error) throw new Error(`Couldn't read leads in progress: ${error.message}`);

  let released = 0;
  for (const lead of stuck || []) {
    const { data: latest } = await supabaseServiceClient
      .from("calls")
      .select("id, created_at, ended_at")
      .eq("lead_id", lead.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!latest) {
      await supabaseServiceClient
        .from("leads")
        .update({ status: "pending", assigned_agent: null })
        .eq("id", lead.id)
        .eq("status", "in_progress");
      released++;
      continue;
    }

    if (latest.ended_at || Date.now() - Date.parse(latest.created_at) > STALE_CALL_MS) {
      if (await moveLeadAfterCall(latest.id)) released++;
    }
  }
  return released;
}

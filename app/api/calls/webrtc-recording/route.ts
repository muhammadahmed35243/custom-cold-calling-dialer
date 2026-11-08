import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import {
  verifyTelnyxSignature,
  startCallControlRecording,
  hangupCall,
  getOrgCallerIds,
} from "@/lib/telnyx";
import { saveRecordingForCall } from "@/lib/storage";
import { finalizeCallCost, phoneDigits } from "@/lib/billing";
import { moveLeadAfterCall } from "@/lib/leads";

// The WebRTC SDK's Call object doesn't reliably expose Telnyx's server-side
// call_control_id, so the client round-trips our own calls.id through
// Telnyx's client_state instead -- it's base64-encoded when set (Telnyx's
// usual client_state convention), but fall back to the raw value in case
// it comes back unencoded.
function decodeClientState(clientState: string | undefined): string | null {
  if (!clientState) return null;
  try {
    const decoded = Buffer.from(clientState, "base64").toString("utf-8");
    if (/^[0-9a-f-]{36}$/i.test(decoded)) return decoded;
  } catch {
    // fall through
  }
  return /^[0-9a-f-]{36}$/i.test(clientState) ? clientState : null;
}

// The dialer creates the call row, then places the call; a row older than
// this is not the call a webhook is about.
const LINK_WINDOW_MS = 15 * 60 * 1000;

const ok = (message = "OK") => new NextResponse(message, { status: 200 });

function secondsBetween(fromIso: string, toIso: string): number {
  const ms = Date.parse(toIso) - Date.parse(fromIso);
  return Number.isFinite(ms) && ms > 0 ? Math.ceil(ms / 1000) : 0;
}

type LinkResult = { callId: string } | { reason: string };

// Every browser call must go through POST /api/calls first, which applies the
// organization's budget, simultaneous-call and country limits and creates the
// row whose id the dialer passes as client_state. All browsers share one
// Telnyx login, so client_state alone proves nothing: link this Telnyx call
// only to a row made for exactly this call -- not used by another call yet,
// created moments ago, for the number Telnyx is dialing, and showing one of
// that organization's own caller IDs.
async function linkBrowserCall(payload: any): Promise<LinkResult> {
  const callControlId: string | undefined = payload.call_control_id;
  const callId = decodeClientState(payload.client_state);
  if (!callControlId) return { reason: "no call_control_id" };
  if (!callId) return { reason: "no dialer call id" };

  const { data: row, error } = await supabaseServiceClient
    .from("calls")
    .select("id, org_id, mode, twilio_call_sid, created_at, leads(phone)")
    .eq("id", callId)
    .maybeSingle();
  // A database hiccup must not hang up a real call: fail the webhook instead
  // (the call carries on, and Telnyx retries).
  if (error) throw new Error(`Call lookup failed: ${error.message}`);
  if (!row) return { reason: "unknown call id" };
  if (row.twilio_call_sid === callControlId) return { callId: row.id }; // retried webhook
  if (row.twilio_call_sid) return { reason: "call row already used by another call" };
  if (row.mode === "phone") return { reason: "call row is for a phone-bridge call" };
  if (Date.now() - new Date(row.created_at).getTime() > LINK_WINDOW_MS) return { reason: "call row is too old" };

  const lead = Array.isArray(row.leads) ? row.leads[0] : row.leads;
  const dialed = phoneDigits(payload.to);
  if (!dialed || phoneDigits(lead?.phone) !== dialed) return { reason: "dialed number isn't the lead's" };

  const callerIds = await getOrgCallerIds(row.org_id);
  if (!callerIds.has(phoneDigits(payload.from))) {
    return { reason: "caller ID isn't one of the organization's numbers" };
  }

  const { data: linked } = await supabaseServiceClient
    .from("calls")
    .update({ twilio_call_sid: callControlId, caller_id_number: payload.from })
    .eq("id", row.id)
    .is("twilio_call_sid", null)
    .select("id");
  if (linked?.length) return { callId: row.id };

  // Another delivery of this webhook linked it a moment ago -- fine if it
  // linked this same call.
  const { data: again } = await supabaseServiceClient
    .from("calls")
    .select("twilio_call_sid")
    .eq("id", row.id)
    .maybeSingle();
  return again?.twilio_call_sid === callControlId
    ? { callId: row.id }
    : { reason: "call row already used by another call" };
}

async function stopUnverifiedCall(callControlId: string | undefined, reason: string) {
  console.warn("WebRTC: hanging up a call that didn't come from the dialer", { reason, callControlId });
  if (!callControlId) return;
  try {
    await hangupCall(callControlId);
  } catch (err) {
    console.error("WebRTC: hangup failed", err);
  }
}

// Call Control webhooks are JSON (unlike TeXML's form-encoded body), but
// signed the same account-wide Ed25519 way -- verifyTelnyxSignature is
// shared with the TeXML recording handler.
export async function POST(req: NextRequest) {
  const signature = req.headers.get("telnyx-signature-ed25519") || "";
  const timestamp = req.headers.get("telnyx-timestamp") || "";
  const rawBody = await req.text();

  if (!verifyTelnyxSignature(rawBody, signature, timestamp)) {
    return new NextResponse("Signature verification failed", { status: 403 });
  }

  try {
    const event = JSON.parse(rawBody);
    const eventType = event?.data?.event_type;
    const occurredAt: string = event?.data?.occurred_at || new Date().toISOString();
    const payload = event?.data?.payload || {};
    const callControlId: string | undefined = payload.call_control_id;

    if (eventType === "call.initiated") {
      // Only calls a browser places; nothing else on this connection is ours.
      if (payload.direction !== "outgoing") return ok("Ignored");
      const result = await linkBrowserCall(payload);
      if ("reason" in result) await stopUnverifiedCall(callControlId, result.reason);
      return ok();
    }

    if (eventType === "call.answered") {
      if (!callControlId) return ok("Missing call_control_id");

      // Normally linked at call.initiated; link here if that webhook was missed.
      let callId: string;
      const { data: linkedRow } = await supabaseServiceClient
        .from("calls")
        .select("id")
        .eq("twilio_call_sid", callControlId)
        .maybeSingle();
      if (linkedRow) {
        callId = linkedRow.id;
      } else {
        const result = await linkBrowserCall(payload);
        if ("reason" in result) {
          await stopUnverifiedCall(callControlId, result.reason);
          return ok();
        }
        callId = result.callId;
      }

      // First delivery only (Telnyx retries webhooks): record when the lead
      // picked up, which starts the billed time, and start recording.
      const { data: answered } = await supabaseServiceClient
        .from("calls")
        .update({ lead_answered_at: occurredAt })
        .eq("id", callId)
        .is("lead_answered_at", null)
        .select("id, ended_at, billed_at");

      if (answered?.length) {
        try {
          await startCallControlRecording(callControlId);
        } catch (err) {
          console.error("WebRTC: failed to start recording", err);
        }

        // The hangup webhook was handled first; bill now that the answer time is known.
        const row = answered[0];
        if (row.billed_at && row.ended_at) {
          await supabaseServiceClient
            .from("calls")
            .update({ lead_leg_seconds: secondsBetween(occurredAt, row.ended_at) })
            .eq("id", callId);
          await finalizeCallCost(callId);
        }
      }

      return ok();
    }

    if (eventType === "call.hangup") {
      if (!callControlId) return ok("Missing call_control_id");

      const { data: row, error: lookupError } = await supabaseServiceClient
        .from("calls")
        .select("id, lead_answered_at")
        .eq("twilio_call_sid", callControlId)
        .maybeSingle();
      if (lookupError) throw new Error(`Call lookup failed: ${lookupError.message}`);
      if (!row) return ok("Not a dialer call");

      // Telnyx's own end time, not the browser's; billed from the answer.
      const endedAt: string = payload.end_time || occurredAt;
      await supabaseServiceClient
        .from("calls")
        .update({
          ended_at: endedAt,
          lead_leg_seconds: row.lead_answered_at ? secondsBetween(row.lead_answered_at, endedAt) : 0,
        })
        .eq("id", row.id);
      await finalizeCallCost(row.id);
      try {
        await moveLeadAfterCall(row.id);
      } catch (err) {
        console.error("WebRTC: couldn't release the lead", err);
      }

      return ok();
    }

    if (eventType !== "call.recording.saved") {
      // Other Call Control events sent to this same webhook URL.
      return ok("Ignored");
    }

    const recordingUrl: string | undefined =
      payload.recording_urls?.mp3 || payload.public_recording_urls?.mp3;

    if (!recordingUrl) {
      return new NextResponse("No recording URL in payload", { status: 400 });
    }

    // The identifier that ends up on the recording event isn't guaranteed
    // to be exactly call_control_id in every case -- check the likely
    // candidates against what we stored in twilio_call_sid.
    const candidateIds = [payload.call_control_id, payload.call_leg_id, payload.call_session_id].filter(
      Boolean
    );

    let callRecord = null;
    for (const id of candidateIds) {
      const { data } = await supabaseServiceClient
        .from("calls")
        .select("*")
        .eq("twilio_call_sid", id)
        .single();
      if (data) {
        callRecord = data;
        break;
      }
    }

    if (!callRecord) {
      return new NextResponse("Call record not found", { status: 404 });
    }

    await saveRecordingForCall(callRecord.id, recordingUrl, payload.recording_id || null);

    return ok();
  } catch (error) {
    console.error("Error:", error);
    return new NextResponse(`Server error: ${error}`, { status: 500 });
  }
}

// Transcription runs inside this webhook after the recording is stored.
export const maxDuration = 300;

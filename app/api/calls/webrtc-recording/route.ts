import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import { verifyTelnyxSignature, startCallControlRecording } from "@/lib/telnyx";
import { saveRecordingForCall } from "@/lib/storage";

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

// Digits of a phone number, also accepting a SIP URI ("sip:+1555...@host").
function phoneDigits(value: string | null | undefined): string {
  return (value || "").split("@")[0].replace(/\D/g, "");
}

// A WebRTC call row is linked within moments of being created; anything
// older is not the call this webhook is about.
const LINK_WINDOW_MS = 15 * 60 * 1000;

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
    const payload = event?.data?.payload || {};

    if (eventType === "call.answered") {
      // This is the authoritative point to link twilio_call_sid: Telnyx's
      // own webhook always carries the real call_control_id, unlike the
      // client SDK's Call object. Start recording from here too, once the
      // leg is actually up.
      const callId = decodeClientState(payload.client_state);
      const callControlId: string | undefined = payload.call_control_id;
      if (!callId || !callControlId) {
        return new NextResponse("Missing call id or call_control_id", { status: 200 });
      }

      // client_state is set by the browser, so on its own it would let any
      // signed-in caller attach their call (and its recording) to someone
      // else's call row. Only link a row that isn't linked yet, was created
      // moments ago, and whose lead is the number Telnyx actually dialed.
      const { data: callRow } = await supabaseServiceClient
        .from("calls")
        .select("id, twilio_call_sid, created_at, leads(phone)")
        .eq("id", callId)
        .single();

      if (callRow?.twilio_call_sid === callControlId) {
        // A retried webhook for a call that's already linked and recording.
        return new NextResponse("OK", { status: 200 });
      }

      const lead = Array.isArray(callRow?.leads) ? callRow?.leads[0] : callRow?.leads;
      const dialed = phoneDigits(payload.to);
      const isRecent =
        !!callRow && Date.now() - new Date(callRow.created_at).getTime() < LINK_WINDOW_MS;
      if (
        !callRow ||
        callRow.twilio_call_sid ||
        !isRecent ||
        (dialed && phoneDigits(lead?.phone) !== dialed)
      ) {
        console.warn("WebRTC: call.answered doesn't match its call row, not linking", {
          callId,
          to: payload.to,
        });
        return new NextResponse("Call row doesn't match", { status: 200 });
      }

      await supabaseServiceClient
        .from("calls")
        .update({ twilio_call_sid: callControlId })
        .eq("id", callId)
        .is("twilio_call_sid", null);

      try {
        await startCallControlRecording(callControlId);
      } catch (err) {
        console.error("WebRTC: failed to start recording", err);
      }

      return new NextResponse("OK", { status: 200 });
    }

    if (eventType !== "call.recording.saved") {
      // Ignore other Call Control events sent to this same webhook URL
      // (call.initiated, call.hangup, etc.) -- we don't act on them.
      return new NextResponse("Ignored", { status: 200 });
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

    return new NextResponse("OK", { status: 200 });
  } catch (error) {
    console.error("Error:", error);
    return new NextResponse(`Server error: ${error}`, { status: 500 });
  }
}

// Transcription runs inside this webhook after the recording is stored.
export const maxDuration = 300;

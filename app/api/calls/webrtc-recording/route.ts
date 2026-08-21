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

      await supabaseServiceClient
        .from("calls")
        .update({ twilio_call_sid: callControlId })
        .eq("id", callId);

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

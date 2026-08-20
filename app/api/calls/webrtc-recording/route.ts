import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import { verifyTelnyxSignature } from "@/lib/telnyx";
import { saveRecordingForCall } from "@/lib/storage";

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

    if (eventType !== "call.recording.saved") {
      // Ignore other Call Control events sent to this same webhook URL
      // (call.initiated, call.answered, etc.) -- we don't act on them yet.
      return new NextResponse("Ignored", { status: 200 });
    }

    const payload = event.data.payload || {};
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

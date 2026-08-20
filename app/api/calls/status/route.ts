import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import { verifyTelnyxSignature } from "@/lib/telnyx";

export async function POST(req: NextRequest) {
  const signature = req.headers.get("telnyx-signature-ed25519") || "";
  const timestamp = req.headers.get("telnyx-timestamp") || "";

  const rawBody = await req.text();

  if (!verifyTelnyxSignature(rawBody, signature, timestamp)) {
    return new NextResponse("Signature verification failed", { status: 403 });
  }

  const body = Object.fromEntries(new URLSearchParams(rawBody));

  try {
    const callSid = body.CallSid;
    const callStatus = body.CallStatus;
    const callDuration = parseInt(body.CallDuration || "0");

    // Get call record by Twilio SID
    const { data: callRecord, error: getError } = await supabaseServiceClient
      .from("calls")
      .select("*")
      .eq("twilio_call_sid", callSid)
      .single();

    if (getError || !callRecord) {
      return new NextResponse("Call record not found", { status: 404 });
    }

    // Map Twilio/TeXML CallStatus to our agent_call_status. This describes
    // the OUTER call's lifecycle (Telnyx -> agent's phone), not the lead's
    // leg -- lead_call_status is owned exclusively by /api/calls/dial-status,
    // which gets the real DialCallStatus once the inner <Dial> concludes.
    //
    // Once the agent has actually answered (agent_call_status is already
    // "completed", set directly by /api/calls/connect), later terminal
    // events on this same outer call describe how the whole session ended
    // -- not whether the agent picked up -- so they must not overwrite an
    // already-confirmed answer.
    const alreadyAnswered = callRecord.agent_call_status === "completed";
    let agentStatus = callRecord.agent_call_status || "ringing";

    if (callStatus === "ringing" && !alreadyAnswered) {
      agentStatus = "ringing";
    } else if (callStatus === "in-progress") {
      agentStatus = "completed";
    } else if (["no-answer", "busy"].includes(callStatus) && !alreadyAnswered) {
      agentStatus = "no_answer";
    } else if (callStatus === "failed" && !alreadyAnswered) {
      agentStatus = "failed";
    }

    // Update call record
    const updatePayload: Record<string, unknown> = { agent_call_status: agentStatus };

    // Only this handler's own fallback duration/end-time if the call never
    // reached the Dial step at all (agent never answered) -- otherwise
    // dial-status already recorded the real lead-leg duration.
    if (!alreadyAnswered && callStatus === "completed") {
      updatePayload.ended_at = new Date().toISOString();
      updatePayload.duration_seconds = callDuration > 0 ? callDuration : null;
    }

    const { error: updateError } = await supabaseServiceClient
      .from("calls")
      .update(updatePayload)
      .eq("id", callRecord.id);

    if (updateError) {
      console.error("Update error:", updateError);
      return new NextResponse(`Update failed: ${updateError.message}`, { status: 500 });
    }

    return new NextResponse("OK", { status: 200 });
  } catch (error) {
    console.error("Error:", error);
    return new NextResponse(`Server error: ${error}`, { status: 500 });
  }
}

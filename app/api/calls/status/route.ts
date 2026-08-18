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

    // Map Twilio CallStatus to our statuses
    let agentStatus = callRecord.agent_call_status || "ringing";
    let leadStatus = callRecord.lead_call_status || "queued";

    if (callStatus === "ringing") {
      agentStatus = "ringing";
    } else if (callStatus === "in-progress") {
      agentStatus = "completed";
      leadStatus = "ringing";
    } else if (callStatus === "completed") {
      if (callRecord.agent_call_status === "completed" && callRecord.lead_call_status === null) {
        leadStatus = "completed";
      } else if (callRecord.lead_call_status === "ringing") {
        leadStatus = "completed";
      } else {
        leadStatus = "no_answer";
      }
    } else if (callStatus === "no-answer") {
      agentStatus = "no_answer";
    } else if (callStatus === "busy") {
      agentStatus = "no_answer";
    } else if (callStatus === "failed") {
      agentStatus = "failed";
    }

    // Update call record
    const { error: updateError } = await supabaseServiceClient
      .from("calls")
      .update({
        agent_call_status: agentStatus,
        lead_call_status: leadStatus,
        ended_at: callStatus === "completed" ? new Date().toISOString() : null,
        duration_seconds: callDuration > 0 ? callDuration : null,
      })
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

import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import { verifyTelnyxSignature } from "@/lib/telnyx";

// Fires when the inner <Dial> to the lead concludes. This is the only
// reliable source for what actually happened to the lead's leg -- the
// outer call's own StatusCallback (handled in /api/calls/status) describes
// the parent session's lifecycle, which is NOT the same thing and was
// previously being misread as the lead's outcome.
export async function POST(req: NextRequest) {
  const signature = req.headers.get("telnyx-signature-ed25519") || "";
  const timestamp = req.headers.get("telnyx-timestamp") || "";
  const callRecordId = req.nextUrl.searchParams.get("callRecordId");

  const rawBody = await req.text();

  if (!verifyTelnyxSignature(rawBody, signature, timestamp)) {
    return new NextResponse("Signature verification failed", { status: 403 });
  }

  if (!callRecordId) {
    return new NextResponse("Missing callRecordId", { status: 400 });
  }

  const body = Object.fromEntries(new URLSearchParams(rawBody));
  const dialCallStatus = body.DialCallStatus;
  const dialCallDuration = parseInt(body.DialCallDuration || "0", 10);

  let leadStatus: "completed" | "no_answer" | "failed" = "no_answer";
  if (dialCallStatus === "completed") {
    leadStatus = "completed";
  } else if (dialCallStatus === "failed" || dialCallStatus === "canceled") {
    leadStatus = "failed";
  } else if (dialCallStatus === "busy" || dialCallStatus === "no-answer") {
    leadStatus = "no_answer";
  }

  await supabaseServiceClient
    .from("calls")
    .update({
      lead_call_status: leadStatus,
      ended_at: new Date().toISOString(),
      duration_seconds: dialCallDuration > 0 ? dialCallDuration : null,
    })
    .eq("id", callRecordId);

  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`,
    { headers: { "Content-Type": "application/xml" } }
  );
}

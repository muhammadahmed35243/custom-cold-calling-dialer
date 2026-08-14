import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import { buildComplianceAndDialTwiML, verifyTwilioSignature } from "@/lib/twilio";

export async function POST(req: NextRequest) {
  const signature = req.headers.get("x-twilio-signature") || "";
  const callRecordId = req.nextUrl.searchParams.get("callRecordId");

  if (!callRecordId) {
    return new NextResponse("Missing callRecordId", { status: 400 });
  }

  // Parse form data from Twilio
  const formData = await req.formData();
  const body: Record<string, string> = {};
  formData.forEach((value, key) => {
    body[key] = value as string;
  });

  // Verify Twilio signature
  const url = `${process.env.NEXT_PUBLIC_APP_URL}/api/calls/connect?callRecordId=${callRecordId}`;
  if (!verifyTwilioSignature(body, signature, url)) {
    return new NextResponse("Signature verification failed", { status: 403 });
  }

  try {
    // Get the call record to find the lead's phone number
    const { data: callRecord, error: callError } = await supabaseServiceClient
      .from("calls")
      .select("lead_id")
      .eq("id", callRecordId)
      .single();

    if (callError || !callRecord) {
      return new NextResponse("Call record not found", { status: 404 });
    }

    // Get the lead's phone number
    const { data: lead, error: leadError } = await supabaseServiceClient
      .from("leads")
      .select("phone")
      .eq("id", callRecord.lead_id)
      .single();

    if (leadError || !lead) {
      return new NextResponse("Lead not found", { status: 404 });
    }

    // Update call status: agent answered
    await supabaseServiceClient
      .from("calls")
      .update({
        agent_call_status: "completed",
        agent_answered_at: new Date().toISOString(),
      })
      .eq("id", callRecordId);

    // Build TwiML to dial the lead
    const recordingUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/calls/recording`;
    const twiml = buildComplianceAndDialTwiML(lead.phone, recordingUrl);

    return new NextResponse(twiml, {
      headers: { "Content-Type": "application/xml" },
    });
  } catch (error) {
    return new NextResponse(`Server error: ${error}`, { status: 500 });
  }
}

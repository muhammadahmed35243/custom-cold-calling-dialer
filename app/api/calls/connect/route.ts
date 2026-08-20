import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import { buildComplianceAndDialTeXML, verifyTelnyxSignature } from "@/lib/telnyx";

export async function POST(req: NextRequest) {
  const signature = req.headers.get("telnyx-signature-ed25519") || "";
  const timestamp = req.headers.get("telnyx-timestamp") || "";
  const callRecordId = req.nextUrl.searchParams.get("callRecordId");

  if (!callRecordId) {
    return new NextResponse("Missing callRecordId", { status: 400 });
  }

  // Read the raw body first: Telnyx signs the exact raw bytes, not a
  // re-serialized form of the parsed fields (unlike Twilio's scheme).
  const rawBody = await req.text();

  if (!verifyTelnyxSignature(rawBody, signature, timestamp)) {
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

    // Build TeXML to dial the lead
    const recordingUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/calls/recording`;
    const dialStatusUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/calls/dial-status?callRecordId=${callRecordId}`;
    const texml = buildComplianceAndDialTeXML(lead.phone, recordingUrl, dialStatusUrl);

    return new NextResponse(texml, {
      headers: { "Content-Type": "application/xml" },
    });
  } catch (error) {
    return new NextResponse(`Server error: ${error}`, { status: 500 });
  }
}

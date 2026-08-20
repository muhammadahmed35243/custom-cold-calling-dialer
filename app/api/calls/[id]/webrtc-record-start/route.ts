import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { startCallControlRecording } from "@/lib/telnyx";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { user } = await getAuthenticatedUser(req);
  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { callControlId } = await req.json();
    if (!callControlId) {
      return NextResponse.json({ error: "callControlId is required" }, { status: 400 });
    }

    // Link the call_control_id now (not just at hangup) so the
    // call.recording.saved webhook -- which can arrive right at hangup --
    // reliably finds this row by twilio_call_sid regardless of timing.
    await supabaseServiceClient
      .from("calls")
      .update({ twilio_call_sid: callControlId })
      .eq("id", params.id)
      .eq("agent_email", user.email);

    await startCallControlRecording(callControlId);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to start recording: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}

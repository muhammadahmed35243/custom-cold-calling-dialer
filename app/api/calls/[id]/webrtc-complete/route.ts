import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import { getAuthenticatedUser } from "@/lib/api-auth";

// WebRTC calls have no separate "agent leg" the way phone-bridge calls do --
// the agent's own audio IS the browser, connected the moment they're logged
// into the SDK. So there's nothing analogous to /api/calls/connect or
// /api/calls/dial-status here: the browser itself knows the real outcome
// (did the call ever reach the "active" state before hanging up) and
// reports it directly once the call concludes.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { user } = await getAuthenticatedUser(req);
  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { connected, durationSeconds, callControlId } = await req.json();

    const { error } = await supabaseServiceClient
      .from("calls")
      .update({
        agent_call_status: "completed",
        lead_call_status: connected ? "completed" : "no_answer",
        ended_at: new Date().toISOString(),
        duration_seconds: durationSeconds > 0 ? durationSeconds : null,
        twilio_call_sid: callControlId || null,
      })
      .eq("id", params.id)
      .eq("agent_email", user.email);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: `Server error: ${error}` },
      { status: 500 }
    );
  }
}

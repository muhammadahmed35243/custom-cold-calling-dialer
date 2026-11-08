import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import { getActor } from "@/lib/authz";
import { moveLeadAfterCall } from "@/lib/leads";

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
  const { actor, error: authError } = await getActor(req);
  if (authError) return authError;

  try {
    const { connected, durationSeconds } = await req.json();

    // twilio_call_sid is linked server-side by /api/calls/webrtc-recording
    // when Telnyx's call.answered webhook arrives -- don't touch it here,
    // or a null client-side value would wipe out that link on every hangup.
    const { error } = await supabaseServiceClient
      .from("calls")
      .update({
        agent_call_status: "completed",
        lead_call_status: connected ? "completed" : "no_answer",
        duration_seconds: durationSeconds > 0 ? durationSeconds : null,
      })
      .eq("id", params.id)
      .eq("agent_email", actor.email);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Telnyx's hangup webhook records the real end time (used for billing);
    // the browser's clock only fills it in if that hasn't arrived.
    await supabaseServiceClient
      .from("calls")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", params.id)
      .eq("agent_email", actor.email)
      .is("ended_at", null);

    // Covers browser calls Telnyx never saw (so no hangup webhook will come).
    // The browser's "connected" is a hint in case Telnyx's answer event is late.
    try {
      await moveLeadAfterCall(params.id, { answeredHint: !!connected });
    } catch (err) {
      console.error("webrtc-complete: couldn't release the lead", err);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: `Server error: ${error}` },
      { status: 500 }
    );
  }
}

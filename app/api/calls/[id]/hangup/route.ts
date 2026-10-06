import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import { getAuthenticatedUser } from "@/lib/api-auth";

// Ends a phone-bridge call through Telnyx Call Control, which tears down both
// legs. Browser calls hang up in the SDK instead, so this only handles the
// phone-bridge case.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { user } = await getAuthenticatedUser(req);
  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: call } = await supabaseServiceClient
    .from("calls")
    .select("twilio_call_sid")
    .eq("id", params.id)
    .eq("agent_email", user.email)
    .single();

  if (!call?.twilio_call_sid) {
    return NextResponse.json({ error: "Call not found or not yet connected" }, { status: 404 });
  }

  const res = await fetch(
    `https://api.telnyx.com/v2/calls/${encodeURIComponent(call.twilio_call_sid)}/actions/hangup`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.TELNYX_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    }
  );

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    // The call already ended on its own -- that's the outcome the agent wanted.
    if (body?.errors?.[0]?.code === "90018") {
      return NextResponse.json({ success: true, alreadyEnded: true });
    }
    return NextResponse.json(
      { error: `Hang up failed (${res.status}): ${JSON.stringify(body).slice(0, 300)}` },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true });
}

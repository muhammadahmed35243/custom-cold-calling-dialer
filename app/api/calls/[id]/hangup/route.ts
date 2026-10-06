import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import { getAuthenticatedUser } from "@/lib/api-auth";

// Ends a phone-bridge call by setting its TeXML call status to completed,
// which tears down both legs. Browser calls hang up in the SDK instead, so
// this only handles the phone-bridge case.
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
    `https://api.telnyx.com/v2/texml/calls/${process.env.TELNYX_TEXML_CONNECTION_ID}/${call.twilio_call_sid}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.TELNYX_API_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ Status: "completed" }),
    }
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return NextResponse.json(
      { error: `Hang up failed (${res.status}): ${body.slice(0, 300)}` },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true });
}

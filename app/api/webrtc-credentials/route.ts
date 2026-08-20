import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import { getAuthenticatedUser } from "@/lib/api-auth";

// Serves the WebRTC SIP login behind our existing auth wall instead of
// baking it into the public JS bundle via NEXT_PUBLIC_ -- anyone who can
// reach /dialer's static assets could otherwise extract it, regardless of
// whether they pass our client-side auth check.
export async function GET(req: NextRequest) {
  const { user } = await getAuthenticatedUser(req);
  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: agent } = await supabaseServiceClient
    .from("agents")
    .select("is_active")
    .eq("email", user.email)
    .single();

  if (!agent || !agent.is_active) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { TELNYX_WEBRTC_USERNAME, TELNYX_WEBRTC_PASSWORD, TELNYX_PHONE_NUMBER } = process.env;
  if (!TELNYX_WEBRTC_USERNAME || !TELNYX_WEBRTC_PASSWORD) {
    return NextResponse.json({ error: "WebRTC calling is not configured" }, { status: 503 });
  }

  return NextResponse.json({
    username: TELNYX_WEBRTC_USERNAME,
    password: TELNYX_WEBRTC_PASSWORD,
    callerNumber: TELNYX_PHONE_NUMBER,
  });
}

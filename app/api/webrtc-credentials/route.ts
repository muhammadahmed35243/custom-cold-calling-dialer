import { NextRequest, NextResponse } from "next/server";
import { getActor } from "@/lib/authz";
import { getOutboundNumberForAgent } from "@/lib/telnyx";

// Serves the WebRTC SIP login behind our existing auth wall instead of
// baking it into the public JS bundle via NEXT_PUBLIC_ -- anyone who can
// reach /dialer's static assets could otherwise extract it, regardless of
// whether they pass our client-side auth check.
export async function GET(req: NextRequest) {
  const { actor, error: authError } = await getActor(req);
  if (authError) return authError;

  const { TELNYX_WEBRTC_USERNAME, TELNYX_WEBRTC_PASSWORD } = process.env;
  if (!TELNYX_WEBRTC_USERNAME || !TELNYX_WEBRTC_PASSWORD) {
    return NextResponse.json({ error: "WebRTC calling is not configured" }, { status: 503 });
  }

  let callerNumber: string;
  try {
    callerNumber = await getOutboundNumberForAgent(actor.email);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }

  return NextResponse.json({
    username: TELNYX_WEBRTC_USERNAME,
    password: TELNYX_WEBRTC_PASSWORD,
    callerNumber,
  });
}

import { NextRequest, NextResponse } from "next/server";

// Temporary diagnostic endpoint -- lets the browser "phone home" so its
// state shows up in Vercel's logs, since that's what's actually being
// checked, not the browser console. Remove once the WebRTC recording
// linking issue is resolved.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  console.log("[WebRTC Debug]", JSON.stringify(body));
  return NextResponse.json({ success: true });
}

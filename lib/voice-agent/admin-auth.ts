import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import { getAuthenticatedUser } from "@/lib/api-auth";

// Same admin check as app/api/agents/[id]/route.ts, shared here since all
// of app/api/voice-agent/* needs it.
export async function requireAdmin(req: NextRequest) {
  const { user } = await getAuthenticatedUser(req);
  if (!user?.email) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: requester } = await supabaseServiceClient
    .from("agents")
    .select("role")
    .eq("email", user.email)
    .single();

  if (requester?.role !== "admin") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { email: user.email };
}

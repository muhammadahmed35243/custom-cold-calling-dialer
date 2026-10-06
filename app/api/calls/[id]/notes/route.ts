import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import { getAuthenticatedUser } from "@/lib/api-auth";

// Saves call notes while the call is still in progress. Unlike /disposition,
// this doesn't touch the lead's queue status.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { user } = await getAuthenticatedUser(req);
  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { notes } = await req.json();

  const { error } = await supabaseServiceClient
    .from("calls")
    .update({ notes: typeof notes === "string" ? notes : null })
    .eq("id", params.id)
    .eq("agent_email", user.email);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

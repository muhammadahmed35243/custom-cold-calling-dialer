import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import { getAuthenticatedUser } from "@/lib/api-auth";

// Deletes only untouched leads (status='pending'). Leads currently
// in_progress (someone's mid-call) or already called/callback (real
// history -- disposition, notes, recordings) are never touched here. A
// pending lead has no calls row yet (that's only created once someone
// actually dials it), so this delete never cascades into call history.
export async function DELETE(req: NextRequest) {
  const { user } = await getAuthenticatedUser(req);
  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error, count } = await supabaseServiceClient
    .from("leads")
    .delete({ count: "exact" })
    .eq("status", "pending");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, deleted: count ?? 0 });
}

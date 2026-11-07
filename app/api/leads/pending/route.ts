import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import { getActor } from "@/lib/authz";

// Deletes only untouched leads (status='pending'). Leads currently
// in_progress (someone's mid-call) or already called/callback (real
// history -- disposition, notes, recordings) are never touched here. A
// pending lead has no calls row yet (that's only created once someone
// actually dials it), so this delete never cascades into call history.
export async function DELETE(req: NextRequest) {
  const { actor, error: authError } = await getActor(req);
  if (authError) return authError;

  const { error, count } = await supabaseServiceClient
    .from("leads")
    .delete({ count: "exact" })
    .eq("status", "pending")
    .eq("org_id", actor.orgId)
    .eq("owner_email", actor.email);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, deleted: count ?? 0 });
}

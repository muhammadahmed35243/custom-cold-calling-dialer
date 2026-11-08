import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import { getActor } from "@/lib/authz";

// Deletes the caller's untouched leads: waiting in the queue and never
// called. Leads back in the queue for another try have call history
// (deleting a lead deletes its calls, which feed call logs and statements),
// and leads in progress, called or marked for a callback are never touched.
export async function DELETE(req: NextRequest) {
  const { actor, error: authError } = await getActor(req);
  if (authError) return authError;

  const { error, count } = await supabaseServiceClient
    .from("leads")
    .delete({ count: "exact" })
    .eq("status", "pending")
    .is("last_called_at", null)
    .eq("org_id", actor.orgId)
    .eq("owner_email", actor.email);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Retries left in the queue, so the dialer can say why they weren't cleared.
  const { count: kept } = await supabaseServiceClient
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .not("last_called_at", "is", null)
    .eq("org_id", actor.orgId)
    .eq("owner_email", actor.email);

  return NextResponse.json({ success: true, deleted: count ?? 0, kept: kept ?? 0 });
}

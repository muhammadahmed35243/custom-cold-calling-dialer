import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import { getActor } from "@/lib/authz";
import { isAdminRole } from "@/lib/roles";

// Deletes one lead from the queue. Agents can delete their own leads; admins
// any lead in their organization. A lead someone is calling right now, or one
// with real history (a recording or a billed call), is kept: deleting a lead
// deletes its calls too, and that history feeds call logs and statements.
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { actor, error: authError } = await getActor(req);
  if (authError) return authError;

  const { data: lead } = await supabaseServiceClient
    .from("leads")
    .select("id, org_id, owner_email, status")
    .eq("id", params.id)
    .maybeSingle();

  // Same answer for another organization's or another agent's lead as for a
  // missing one, so ids can't be probed.
  const allowed =
    !!lead && lead.org_id === actor.orgId && (isAdminRole(actor.role) || lead.owner_email === actor.email);
  if (!lead || !allowed) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  if (lead.status === "in_progress") {
    return NextResponse.json({ error: "Someone is calling this lead right now." }, { status: 409 });
  }

  const { data: history, error: historyError } = await supabaseServiceClient
    .from("calls")
    .select("id")
    .eq("lead_id", lead.id)
    .or("recording_storage_path.not.is.null,price_usd.gt.0")
    .limit(1);
  if (historyError) return NextResponse.json({ error: historyError.message }, { status: 500 });
  if (history?.length) {
    return NextResponse.json(
      { error: "This lead has call recordings or billed calls, so it's kept for your records." },
      { status: 409 }
    );
  }

  const { error } = await supabaseServiceClient
    .from("leads")
    .delete()
    .eq("id", lead.id)
    .eq("org_id", actor.orgId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

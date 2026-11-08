import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import { requireRole, canAccessOrg, ADMIN_ROLES, type Actor } from "@/lib/authz";
import { logAudit } from "@/lib/audit";

type TargetAgent = { id: string; email: string; role: string; org_id: string };

// Loads the target and applies the rules every change shares: it must be in
// the caller's organization (the super admin can reach any), only the super
// admin may touch the super admin's row, and a sub admin may manage agents
// but not other admins.
async function loadManageableAgent(
  actor: Actor,
  id: string
): Promise<{ target: TargetAgent; error?: undefined } | { target?: undefined; error: NextResponse }> {
  const { data: target } = await supabaseServiceClient
    .from("agents")
    .select("id, email, role, org_id")
    .eq("id", id)
    .single();

  if (!target || !canAccessOrg(actor, target.org_id)) {
    return { error: NextResponse.json({ error: "Agent not found" }, { status: 404 }) };
  }
  if (target.role === "super_admin" && actor.role !== "super_admin") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  if (actor.role === "admin" && target.role === "admin" && target.id !== actor.agentId) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { target };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { actor, error: authError } = await requireRole(req, ADMIN_ROLES);
  if (authError) return authError;

  const { target, error: targetError } = await loadManageableAgent(actor, params.id);
  if (targetError) return targetError;

  const body = await req.json();
  const updates: Record<string, unknown> = {};

  if ("is_active" in body) {
    // Deactivating yourself would lock you out with nobody else able to undo it.
    if (body.is_active === false && target.id === actor.agentId) {
      return NextResponse.json({ error: "You can't deactivate your own account" }, { status: 400 });
    }
    updates.is_active = !!body.is_active;
  }
  if ("alias_email" in body) updates.alias_email = body.alias_email || null;
  if ("outbound_phone_number_id" in body) {
    const numberId = body.outbound_phone_number_id || null;
    if (numberId) {
      // The number must belong to the same organization as the agent.
      const { data: number } = await supabaseServiceClient
        .from("phone_numbers")
        .select("org_id, released_at")
        .eq("id", numberId)
        .single();
      if (!number || number.org_id !== target.org_id || number.released_at) {
        return NextResponse.json({ error: "That number doesn't belong to this organization" }, { status: 400 });
      }
    }
    updates.outbound_phone_number_id = numberId;
  }

  const { error } = await supabaseServiceClient.from("agents").update(updates).eq("id", target.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAudit(actor, target.org_id, "agent.updated", { agent: target.email, changes: updates });
  return NextResponse.json({ success: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { actor, error: authError } = await requireRole(req, ADMIN_ROLES);
  if (authError) return authError;

  const { target, error: targetError } = await loadManageableAgent(actor, params.id);
  if (targetError) return targetError;

  if (target.role === "super_admin" || target.id === actor.agentId) {
    return NextResponse.json({ error: "This account can't be deleted" }, { status: 400 });
  }
  // Removing a sub admin (the owner of an organization) is a super admin decision.
  if (target.role === "admin" && actor.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await supabaseServiceClient.from("agents").delete().eq("id", target.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAudit(actor, target.org_id, "agent.deleted", { agent: target.email, role: target.role });
  return NextResponse.json({ success: true });
}

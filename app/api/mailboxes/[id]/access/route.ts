import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import { getActor } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { canManageShared, SHARED_ACCESS, type SharedAccess } from "@/lib/mailboxes";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Sets what one agent can use of the organization's shared mailbox:
// { agentId, access: "full" | "alias" | "none" }. For that organization's
// admins and the super admin.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { actor, error: authError } = await getActor(req);
  if (authError) return authError;

  const body = await req.json().catch(() => ({}));
  const agentId = typeof body.agentId === "string" ? body.agentId : "";
  if (!UUID.test(params.id) || !UUID.test(agentId) || !(SHARED_ACCESS as readonly string[]).includes(body.access)) {
    return NextResponse.json({ error: "Choose an agent and what they can use" }, { status: 400 });
  }
  const access = body.access as SharedAccess;

  const { data: mailbox } = await supabaseServiceClient
    .from("mailboxes")
    .select("id, org_id, agent_id, email")
    .eq("id", params.id)
    .maybeSingle();
  if (!mailbox || mailbox.agent_id || !canManageShared(actor, mailbox.org_id)) {
    return NextResponse.json({ error: "Mailbox not found" }, { status: 404 });
  }

  const { data: agent } = await supabaseServiceClient
    .from("agents")
    .select("id, email, role, org_id, alias_email")
    .eq("id", agentId)
    .maybeSingle();
  if (!agent || agent.org_id !== mailbox.org_id || agent.role !== "agent") {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }
  if (access === "alias" && !agent.alias_email) {
    return NextResponse.json({ error: "This agent has no alias yet. Add one in Manage Agents first." }, { status: 400 });
  }

  const { error } = await supabaseServiceClient.from("mailbox_access").upsert(
    {
      mailbox_id: mailbox.id,
      agent_id: agent.id,
      access,
      updated_by: actor.email,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "mailbox_id,agent_id" }
  );
  if (error) return NextResponse.json({ error: `Couldn't save: ${error.message}` }, { status: 500 });

  await logAudit(actor, mailbox.org_id, "mailbox.access_changed", {
    mailbox: mailbox.email,
    agent: agent.email,
    access,
  });
  return NextResponse.json({ success: true });
}

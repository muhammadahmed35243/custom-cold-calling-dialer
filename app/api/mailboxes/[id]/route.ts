import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import { getActor } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { canManageShared, revokeGoogle, type MailboxRow } from "@/lib/mailboxes";

// Disconnects a mailbox and deletes its stored password or Google token.
// Agents disconnect their own; admins their organization's shared one.
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { actor, error: authError } = await getActor(req);
  if (authError) return authError;

  const { data } = await supabaseServiceClient.from("mailboxes").select("*").eq("id", params.id).maybeSingle();
  const row = data as MailboxRow | null;

  const allowed =
    !!row && (row.agent_id ? row.agent_id === actor.agentId || actor.role === "super_admin" : canManageShared(actor, row.org_id));
  if (!row || !allowed) {
    return NextResponse.json({ error: "Mailbox not found" }, { status: 404 });
  }

  if (row.kind === "google_oauth") await revokeGoogle(row);

  const { error } = await supabaseServiceClient.from("mailboxes").delete().eq("id", row.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit(actor, row.org_id, row.agent_id ? "mailbox.own_disconnected" : "mailbox.shared_disconnected", {
    email: row.email,
  });
  return NextResponse.json({ success: true });
}

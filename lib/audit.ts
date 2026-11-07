import { supabaseServiceClient } from "./supabase";
import type { Actor } from "./authz";

// Records who changed what. Failures are logged, not thrown: an audit write
// problem shouldn't undo a settings change the admin already made.
export async function logAudit(
  actor: Actor,
  orgId: string | null,
  action: string,
  details: Record<string, unknown> = {}
) {
  const { error } = await supabaseServiceClient.from("audit_log").insert([
    { org_id: orgId, actor_email: actor.email, action, details },
  ]);
  if (error) console.error("audit_log insert failed:", action, error.message);
}

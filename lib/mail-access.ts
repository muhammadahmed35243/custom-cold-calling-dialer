import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "./supabase";
import { getActor, FOUNDING_ORG_ID, ADMIN_ROLES, type Actor } from "./authz";

export type MailboxUser = {
  actor: Actor;
  // Admins see the whole mailbox; agents only mail to or from their alias.
  isAdmin: boolean;
  aliasEmail: string | null;
  displayName: string;
};

type MailboxResult = { user: MailboxUser; error?: undefined } | { user?: undefined; error: NextResponse };

// The mailbox is JETZT's one shared account (the SMTP_* env vars), so only the
// founding organization can use it until organizations get their own mailbox.
export function orgHasMailbox(actor: Actor): boolean {
  return actor.orgId === FOUNDING_ORG_ID;
}

export const NO_MAILBOX_MESSAGE = "Email isn't set up for your organization yet. Ask JETZT to connect a mailbox.";

export async function getMailboxUser(req: NextRequest): Promise<MailboxResult> {
  const { actor, error } = await getActor(req);
  if (error) return { error };

  if (!orgHasMailbox(actor)) {
    return { error: NextResponse.json({ error: NO_MAILBOX_MESSAGE }, { status: 503 }) };
  }

  const { data: agent } = await supabaseServiceClient
    .from("agents")
    .select("alias_email, display_name")
    .eq("id", actor.agentId)
    .single();

  const isAdmin = ADMIN_ROLES.includes(actor.role);
  // An agent with no alias assigned has no mailbox to view at all, not just
  // nothing to show.
  if (!isAdmin && !agent?.alias_email) {
    return {
      error: NextResponse.json({ error: "No mailbox alias assigned -- contact your admin" }, { status: 403 }),
    };
  }

  return {
    user: {
      actor,
      isAdmin,
      aliasEmail: agent?.alias_email ?? null,
      displayName: agent?.display_name || actor.email,
    },
  };
}

import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "./supabase";
import { getAuthenticatedUser } from "./api-auth";
import { ADMIN_ROLES, type Role } from "./roles";

export { ADMIN_ROLES, type Role };

// JETZT's own organization. Fixed id (set in migration 0007) so code and the
// voice runtime can refer to it; env-var fallbacks (caller ID, mailbox) apply
// only to this org.
export const FOUNDING_ORG_ID = "00000000-0000-0000-0000-000000000001";

export type Organization = {
  id: string;
  name: string;
  status: "active" | "suspended";
  monthly_budget_usd: number | null;
  call_markup_pct: number;
  number_markup_pct: number;
  voice_assistant_price_per_min: number;
  max_agents: number | null;
  max_phone_numbers: number | null;
  max_concurrent_calls: number | null;
  allowed_country_codes: string[] | null;
  ai_features_enabled: boolean;
  voice_assistant_enabled: boolean;
  recording_enabled: boolean;
  recording_retention_days: number | null;
  calling_hours_start: number | null;
  calling_hours_end: number | null;
  created_at: string;
  updated_at: string;
};

export type Actor = {
  email: string;
  agentId: string;
  role: Role;
  orgId: string;
  org: Organization;
};

type ActorResult = { actor: Actor; error?: undefined } | { actor?: undefined; error: NextResponse };

function deny(status: number, error: string): { error: NextResponse } {
  return { error: NextResponse.json({ error }, { status }) };
}

// Every API route's identity check. A valid Google session alone isn't
// enough: the caller must be an active agent in an active organization (the
// super admin is exempt from suspension so they can never lock themselves out).
export async function getActor(req: NextRequest): Promise<ActorResult> {
  const { user } = await getAuthenticatedUser(req);
  if (!user?.email) return deny(401, "Unauthorized");

  const { data: agent } = await supabaseServiceClient
    .from("agents")
    .select("id, email, role, is_active, org_id, organizations(*)")
    .eq("email", user.email)
    .single();

  if (!agent || !agent.is_active) return deny(403, "Your account isn't active");

  const org = (Array.isArray(agent.organizations) ? agent.organizations[0] : agent.organizations) as
    | Organization
    | null;
  if (!org) return deny(403, "Your account isn't linked to an organization");

  const role = agent.role as Role;
  if (org.status === "suspended" && role !== "super_admin") {
    return deny(403, "Your organization is suspended. Contact JETZT.");
  }

  return { actor: { email: agent.email, agentId: agent.id, role, orgId: agent.org_id, org } };
}

export async function requireRole(req: NextRequest, roles: Role[]): Promise<ActorResult> {
  const result = await getActor(req);
  if (result.error) return result;
  if (!roles.includes(result.actor.role)) return deny(403, "Forbidden");
  return result;
}

// The organization an admin request acts on. The super admin may target any
// organization with ?orgId= (from the super admin console); everyone else is
// pinned to their own.
export function targetOrgId(req: NextRequest, actor: Actor): string {
  if (actor.role === "super_admin") {
    return req.nextUrl.searchParams.get("orgId") || actor.orgId;
  }
  return actor.orgId;
}

// For routes that act on one row by id: may this caller touch a row that
// belongs to rowOrgId?
export function canAccessOrg(actor: Actor, rowOrgId: string | null | undefined): boolean {
  return actor.role === "super_admin" || (!!rowOrgId && rowOrgId === actor.orgId);
}

// Admins buy numbers for their own organization, within its number limit (a
// limit of 0 turns buying off) and budget, at its marked-up price. The super
// admin buys for any organization.
export function canBuyNumbers(actor: Actor, org: Organization = actor.org): boolean {
  if (actor.role === "super_admin") return true;
  return ADMIN_ROLES.includes(actor.role) && org.max_phone_numbers !== 0;
}

export const BUY_NUMBERS_BLOCKED_MESSAGE =
  "Your organization can't buy phone numbers. Ask JETZT to raise its number limit.";

// Telnyx's own prices (JETZT's cost) are only for JETZT: the super admin, and
// JETZT's own team, whose price is the cost anyway.
export function canSeeCosts(actor: Actor): boolean {
  return actor.role === "super_admin" || actor.orgId === FOUNDING_ORG_ID;
}

export async function loadOrganization(orgId: string): Promise<Organization | null> {
  const { data } = await supabaseServiceClient.from("organizations").select("*").eq("id", orgId).single();
  return (data as Organization) || null;
}

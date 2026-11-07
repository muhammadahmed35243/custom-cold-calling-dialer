import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import { requireRole, targetOrgId, loadOrganization, ADMIN_ROLES } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { validateAndFormatPhone } from "@/lib/phone";

// Lists the team of one organization: the caller's own, or for the super
// admin, whichever organization ?orgId= names.
export async function GET(req: NextRequest) {
  const { actor, error: authError } = await requireRole(req, ADMIN_ROLES);
  if (authError) return authError;

  const { data, error } = await supabaseServiceClient
    .from("agents")
    .select("*")
    .eq("org_id", targetOrgId(req, actor))
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ agents: data });
}

// Agents are created here rather than from the browser so the role can't be
// chosen by the caller -- new agents are always plain agents, in the caller's
// organization, within that organization's agent limit.
export async function POST(req: NextRequest) {
  const { actor, error: authError } = await requireRole(req, ADMIN_ROLES);
  if (authError) return authError;

  const orgId = targetOrgId(req, actor);
  const org = orgId === actor.orgId ? actor.org : await loadOrganization(orgId);
  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  const { email, display_name, phone_number, alias_email } = await req.json();
  if (!email || !display_name) {
    return NextResponse.json({ error: "Email and name are required" }, { status: 400 });
  }

  if (org.max_agents !== null) {
    const { count, error: countError } = await supabaseServiceClient
      .from("agents")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("role", "agent");
    if (countError) return NextResponse.json({ error: countError.message }, { status: 500 });
    if ((count ?? 0) >= org.max_agents) {
      return NextResponse.json(
        { error: `Your plan allows ${org.max_agents} agent${org.max_agents === 1 ? "" : "s"}. Remove one or ask JETZT to raise the limit.` },
        { status: 403 }
      );
    }
  }

  let formattedPhone: string | null = null;
  if (phone_number) {
    const phoneResult = validateAndFormatPhone(phone_number);
    if (!phoneResult.valid || !phoneResult.formatted) {
      return NextResponse.json({ error: phoneResult.error || "Invalid phone number" }, { status: 400 });
    }
    formattedPhone = phoneResult.formatted;
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const { data, error } = await supabaseServiceClient
    .from("agents")
    .insert([
      {
        email: normalizedEmail,
        display_name: String(display_name).trim(),
        phone_number: formattedPhone,
        alias_email: alias_email ? String(alias_email).trim() : null,
        role: "agent",
        is_active: true,
        org_id: orgId,
      },
    ])
    .select()
    .single();

  if (error) {
    // Emails are unique across every organization, so this can also mean the
    // person already belongs to a different organization.
    const status = error.code === "23505" ? 409 : 500;
    const message = error.code === "23505" ? "An account with that email already exists" : error.message;
    return NextResponse.json({ error: message }, { status });
  }

  await logAudit(actor, orgId, "agent.created", { agent: normalizedEmail });
  return NextResponse.json({ agent: data });
}

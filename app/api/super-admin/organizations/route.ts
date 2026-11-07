import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import { requireRole, FOUNDING_ORG_ID } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { parseOrgSettings, VOICE_ONLY_FOUNDING_MESSAGE } from "@/lib/org-settings";

type Member = { org_id: string; email: string; display_name: string; role: string; is_active: boolean };

// Every organization with its admins and how much of its limits it uses.
export async function GET(req: NextRequest) {
  const { error: authError } = await requireRole(req, ["super_admin"]);
  if (authError) return authError;

  const [orgsResult, membersResult, numbersResult] = await Promise.all([
    supabaseServiceClient.from("organizations").select("*").order("created_at", { ascending: true }),
    supabaseServiceClient.from("agents").select("org_id, email, display_name, role, is_active"),
    supabaseServiceClient.from("phone_numbers").select("org_id"),
  ]);

  const failed = orgsResult.error || membersResult.error || numbersResult.error;
  if (failed) return NextResponse.json({ error: failed.message }, { status: 500 });

  const members = (membersResult.data || []) as Member[];
  const numbers = numbersResult.data || [];

  const organizations = (orgsResult.data || []).map((org) => {
    const orgMembers = members.filter((m) => m.org_id === org.id);
    return {
      ...org,
      isFounding: org.id === FOUNDING_ORG_ID,
      admins: orgMembers
        .filter((m) => m.role !== "agent")
        .map((m) => ({ email: m.email, display_name: m.display_name, role: m.role, is_active: m.is_active })),
      agentCount: orgMembers.filter((m) => m.role === "agent").length,
      numberCount: numbers.filter((n) => n.org_id === org.id).length,
    };
  });

  return NextResponse.json({ organizations });
}

// Creates an organization together with its sub admin, who signs in with the
// Google account for adminEmail.
export async function POST(req: NextRequest) {
  const { actor, error: authError } = await requireRole(req, ["super_admin"]);
  if (authError) return authError;

  const body = await req.json();
  const adminEmail = String(body.adminEmail || "").trim().toLowerCase();
  const adminName = String(body.adminName || "").trim();

  if (!body.name || !adminEmail || !adminName) {
    return NextResponse.json(
      { error: "Organization name, admin email and admin name are required" },
      { status: 400 }
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
    return NextResponse.json({ error: "That admin email doesn't look right" }, { status: 400 });
  }

  const parsed = parseOrgSettings(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { settings } = parsed;
  if (settings.voice_assistant_enabled) {
    return NextResponse.json({ error: VOICE_ONLY_FOUNDING_MESSAGE }, { status: 400 });
  }

  // A person belongs to exactly one organization. Check before creating
  // anything, ignoring case (ilike), with its wildcards escaped.
  const { data: existing } = await supabaseServiceClient
    .from("agents")
    .select("id")
    .ilike("email", adminEmail.replace(/[\\%_]/g, "\\$&"))
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: "That email already belongs to an account. Each person can be in only one organization." },
      { status: 409 }
    );
  }

  const { data: org, error: orgError } = await supabaseServiceClient
    .from("organizations")
    .insert([settings])
    .select()
    .single();
  if (orgError || !org) {
    return NextResponse.json({ error: orgError?.message || "Failed to create organization" }, { status: 500 });
  }

  const { error: adminError } = await supabaseServiceClient.from("agents").insert([
    { email: adminEmail, display_name: adminName, role: "admin", is_active: true, org_id: org.id },
  ]);
  if (adminError) {
    // Don't leave an organization behind with nobody able to manage it.
    await supabaseServiceClient.from("organizations").delete().eq("id", org.id);
    const duplicate = adminError.code === "23505";
    return NextResponse.json(
      { error: duplicate ? "That email already belongs to an account" : adminError.message },
      { status: duplicate ? 409 : 500 }
    );
  }

  await logAudit(actor, org.id, "org.created", { name: org.name, admin: adminEmail, settings });
  return NextResponse.json({ organization: org });
}

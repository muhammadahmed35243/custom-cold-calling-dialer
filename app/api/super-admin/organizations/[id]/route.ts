import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import { requireRole, FOUNDING_ORG_ID } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { parseOrgSettings, VOICE_ONLY_FOUNDING_MESSAGE } from "@/lib/org-settings";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { error: authError } = await requireRole(req, ["super_admin"]);
  if (authError) return authError;

  const { data: organization } = await supabaseServiceClient
    .from("organizations")
    .select("*")
    .eq("id", params.id)
    .single();

  if (!organization) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }
  return NextResponse.json({ organization });
}

// Changes an organization's settings, or suspends / reactivates it. Suspending
// locks its members out of every route; their data and numbers are kept.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { actor, error: authError } = await requireRole(req, ["super_admin"]);
  if (authError) return authError;

  const body = await req.json();
  const parsed = parseOrgSettings(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { settings } = parsed;

  if ("status" in body) {
    if (body.status !== "active" && body.status !== "suspended") {
      return NextResponse.json({ error: "Status must be active or suspended" }, { status: 400 });
    }
    if (body.status === "suspended" && params.id === FOUNDING_ORG_ID) {
      return NextResponse.json({ error: "JETZT's own organization can't be suspended" }, { status: 400 });
    }
    settings.status = body.status;
  }

  if (settings.voice_assistant_enabled === true && params.id !== FOUNDING_ORG_ID) {
    return NextResponse.json({ error: VOICE_ONLY_FOUNDING_MESSAGE }, { status: 400 });
  }
  if (Object.keys(settings).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data: before } = await supabaseServiceClient
    .from("organizations")
    .select("*")
    .eq("id", params.id)
    .single();
  if (!before) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  const { data: organization, error } = await supabaseServiceClient
    .from("organizations")
    .update({ ...settings, updated_at: new Date().toISOString() })
    .eq("id", params.id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Audit only what actually changed, with the old and new value.
  const changes = Object.fromEntries(
    Object.entries(settings)
      .filter(([key, value]) => JSON.stringify(before[key]) !== JSON.stringify(value))
      .map(([key, value]) => [key, { from: before[key], to: value }])
  );
  if (Object.keys(changes).length > 0) {
    const action =
      "status" in changes
        ? settings.status === "suspended"
          ? "org.suspended"
          : "org.reactivated"
        : "org.updated";
    await logAudit(actor, params.id, action, { changes });
  }

  return NextResponse.json({ organization });
}

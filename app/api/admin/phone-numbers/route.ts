import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import { requireRole, targetOrgId, loadOrganization, canSeeCosts, ADMIN_ROLES } from "@/lib/authz";

// The organization's current numbers (released ones stay in the table for
// statements but aren't listed), and how many it may hold.
export async function GET(req: NextRequest) {
  const { actor, error: authError } = await requireRole(req, ADMIN_ROLES);
  if (authError) return authError;

  const orgId = targetOrgId(req, actor);
  const org = orgId === actor.orgId ? actor.org : await loadOrganization(orgId);
  if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

  const { data, error } = await supabaseServiceClient
    .from("phone_numbers")
    .select("*")
    .eq("org_id", orgId)
    .is("released_at", null)
    .order("purchased_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const showCost = canSeeCosts(actor);
  const numbers = (data || []).map((n: Record<string, unknown>) => {
    if (showCost) return n;
    const visible = { ...n };
    delete visible.monthly_cost;
    delete visible.upfront_cost;
    return visible;
  });

  return NextResponse.json({ numbers, limit: org.max_phone_numbers });
}

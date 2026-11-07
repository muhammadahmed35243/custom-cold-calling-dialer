import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import { requireRole, targetOrgId, ADMIN_ROLES } from "@/lib/authz";

// Every call in one organization: the caller's own, or for the super admin,
// whichever organization ?orgId= names.
export async function GET(req: NextRequest) {
  const { actor, error: authError } = await requireRole(req, ADMIN_ROLES);
  if (authError) return authError;

  const { data, error } = await supabaseServiceClient
    .from("calls")
    .select("*")
    .eq("org_id", targetOrgId(req, actor))
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ calls: data });
}

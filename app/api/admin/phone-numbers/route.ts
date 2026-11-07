import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import { requireRole, targetOrgId, ADMIN_ROLES } from "@/lib/authz";

export async function GET(req: NextRequest) {
  const { actor, error: authError } = await requireRole(req, ADMIN_ROLES);
  if (authError) return authError;

  const { data, error } = await supabaseServiceClient
    .from("phone_numbers")
    .select("*")
    .eq("org_id", targetOrgId(req, actor))
    .order("purchased_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ numbers: data });
}

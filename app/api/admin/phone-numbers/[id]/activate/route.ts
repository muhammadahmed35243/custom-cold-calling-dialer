import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import { requireRole, canAccessOrg, ADMIN_ROLES } from "@/lib/authz";
import { logAudit } from "@/lib/audit";

// Sets this number as its organization's default outbound caller ID for any
// agent without a specific number assignment. Each organization can have one
// active number (a DB constraint enforces that), so clear the current one in
// the same organization first.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { actor, error: authError } = await requireRole(req, ADMIN_ROLES);
  if (authError) return authError;

  const { data: number } = await supabaseServiceClient
    .from("phone_numbers")
    .select("id, org_id, phone_number, released_at")
    .eq("id", params.id)
    .single();

  if (!number || !canAccessOrg(actor, number.org_id) || number.released_at) {
    return NextResponse.json({ error: "Number not found" }, { status: 404 });
  }

  const { error: clearError } = await supabaseServiceClient
    .from("phone_numbers")
    .update({ is_active: false })
    .eq("org_id", number.org_id)
    .eq("is_active", true);
  if (clearError) {
    return NextResponse.json({ error: clearError.message }, { status: 500 });
  }

  const { error } = await supabaseServiceClient
    .from("phone_numbers")
    .update({ is_active: true })
    .eq("id", number.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAudit(actor, number.org_id, "number.set_default", { phone_number: number.phone_number });
  return NextResponse.json({ success: true });
}

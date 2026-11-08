import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import { requireRole, canAccessOrg, ADMIN_ROLES } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { releaseNumber } from "@/lib/telnyx";

// Gives a number back to Telnyx so its monthly charge stops. The row stays
// (marked released) so statements still show the months it was held. Agents
// assigned to it fall back to the organization's default number.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { actor, error: authError } = await requireRole(req, ADMIN_ROLES);
  if (authError) return authError;

  const { data: number } = await supabaseServiceClient
    .from("phone_numbers")
    .select("id, org_id, phone_number, telnyx_id, is_active, released_at")
    .eq("id", params.id)
    .maybeSingle();

  if (!number || !canAccessOrg(actor, number.org_id)) {
    return NextResponse.json({ error: "Number not found" }, { status: 404 });
  }
  if (number.released_at) {
    return NextResponse.json({ error: "That number was already released" }, { status: 409 });
  }

  try {
    await releaseNumber(number.telnyx_id);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  }

  const { error: unassignError } = await supabaseServiceClient
    .from("agents")
    .update({ outbound_phone_number_id: null })
    .eq("outbound_phone_number_id", number.id);

  const { error } = await supabaseServiceClient
    .from("phone_numbers")
    .update({ released_at: new Date().toISOString(), released_by: actor.email, is_active: false })
    .eq("id", number.id);

  if (error || unassignError) {
    return NextResponse.json(
      {
        error: `The number was released on Telnyx but this page couldn't be updated: ${(error || unassignError)!.message}`,
      },
      { status: 500 }
    );
  }

  // If this was the default caller ID, the newest remaining number takes over.
  if (number.is_active) {
    const { data: next } = await supabaseServiceClient
      .from("phone_numbers")
      .select("id")
      .eq("org_id", number.org_id)
      .is("released_at", null)
      .order("purchased_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (next) {
      await supabaseServiceClient.from("phone_numbers").update({ is_active: true }).eq("id", next.id);
    }
  }

  await logAudit(actor, number.org_id, "number.released", { phone_number: number.phone_number });
  return NextResponse.json({ success: true });
}

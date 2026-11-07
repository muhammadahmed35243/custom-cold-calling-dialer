import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import {
  requireRole,
  targetOrgId,
  loadOrganization,
  canBuyNumbers,
  ADMIN_ROLES,
  BUY_NUMBERS_BLOCKED_MESSAGE,
} from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { purchaseNumber } from "@/lib/telnyx";

export async function POST(req: NextRequest) {
  const { actor, error: authError } = await requireRole(req, ADMIN_ROLES);
  if (authError) return authError;

  if (!canBuyNumbers(actor)) {
    return NextResponse.json({ error: BUY_NUMBERS_BLOCKED_MESSAGE }, { status: 403 });
  }

  // Check the organization exists and has room before spending money on
  // Telnyx; the row insert after the purchase would fail otherwise and leave
  // a paid, unrecorded number.
  const orgId = targetOrgId(req, actor);
  const org = orgId === actor.orgId ? actor.org : await loadOrganization(orgId);
  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }
  if (org.max_phone_numbers !== null) {
    const { count, error: countError } = await supabaseServiceClient
      .from("phone_numbers")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId);
    if (countError) return NextResponse.json({ error: countError.message }, { status: 500 });
    if ((count ?? 0) >= org.max_phone_numbers) {
      return NextResponse.json(
        { error: `${org.name} can have ${org.max_phone_numbers} number${org.max_phone_numbers === 1 ? "" : "s"}. Raise the limit first.` },
        { status: 403 }
      );
    }
  }

  const { phoneNumber, countryCode, monthlyCost, upfrontCost } = await req.json();
  if (!phoneNumber || !countryCode) {
    return NextResponse.json({ error: "phoneNumber and countryCode are required" }, { status: 400 });
  }

  let telnyxId: string;
  try {
    const order = await purchaseNumber(phoneNumber);
    telnyxId = order.telnyxId;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  }

  // The number is bought at this point even if the row below fails to
  // write -- record it even on a partial failure so it isn't silently
  // bought and then lost from the admin's view.
  const { data, error } = await supabaseServiceClient
    .from("phone_numbers")
    .insert([
      {
        phone_number: phoneNumber,
        telnyx_id: telnyxId,
        country_code: countryCode.toUpperCase(),
        monthly_cost: monthlyCost ?? null,
        upfront_cost: upfrontCost ?? null,
        purchased_by: actor.email,
        org_id: orgId,
      },
    ])
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: `Number was purchased on Telnyx (id ${telnyxId}) but failed to save here: ${error.message}` },
      { status: 500 }
    );
  }

  await logAudit(actor, orgId, "number.purchased", { phone_number: phoneNumber, telnyx_id: telnyxId });
  return NextResponse.json({ success: true, number: data });
}

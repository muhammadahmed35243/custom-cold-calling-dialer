import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import {
  requireRole,
  targetOrgId,
  loadOrganization,
  canBuyNumbers,
  canSeeCosts,
  ADMIN_ROLES,
  BUY_NUMBERS_BLOCKED_MESSAGE,
} from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { findAvailableNumber, purchaseNumber } from "@/lib/telnyx";
import { money, monthSpend, numberPrice } from "@/lib/billing";

export async function POST(req: NextRequest) {
  const { actor, error: authError } = await requireRole(req, ADMIN_ROLES);
  if (authError) return authError;

  // Every check happens before spending money on Telnyx; the row insert after
  // the purchase would fail otherwise and leave a paid, unrecorded number.
  const orgId = targetOrgId(req, actor);
  const org = orgId === actor.orgId ? actor.org : await loadOrganization(orgId);
  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }
  if (!canBuyNumbers(actor, org)) {
    return NextResponse.json({ error: BUY_NUMBERS_BLOCKED_MESSAGE }, { status: 403 });
  }

  const { count: heldCount, error: countError } = await supabaseServiceClient
    .from("phone_numbers")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .is("released_at", null);
  if (countError) return NextResponse.json({ error: countError.message }, { status: 500 });

  if (org.max_phone_numbers !== null && (heldCount ?? 0) >= org.max_phone_numbers) {
    const limit = `${org.name} can have ${org.max_phone_numbers} number${org.max_phone_numbers === 1 ? "" : "s"}.`;
    return NextResponse.json(
      {
        error:
          actor.role === "super_admin"
            ? `${limit} Raise the limit first.`
            : `${limit} Release one first, or ask JETZT to raise the limit.`,
      },
      { status: 403 }
    );
  }

  const { phoneNumber, countryCode } = await req.json();
  if (!phoneNumber || !countryCode) {
    return NextResponse.json({ error: "phoneNumber and countryCode are required" }, { status: 400 });
  }

  // Price comes from Telnyx itself, never from the browser.
  const available = await findAvailableNumber(phoneNumber, countryCode);
  if (!available) {
    return NextResponse.json({ error: "That number isn't available anymore. Search again." }, { status: 409 });
  }
  const monthlyPrice = numberPrice(available.monthlyCost, org.number_markup_pct);
  const upfrontPrice = numberPrice(available.upfrontCost, org.number_markup_pct);

  if (org.monthly_budget_usd != null) {
    const budget = Number(org.monthly_budget_usd);
    const addition = (monthlyPrice ?? 0) + (upfrontPrice ?? 0);
    const spend = await monthSpend(org.id);
    if (spend.totalPrice + addition > budget) {
      return NextResponse.json(
        {
          error: `This number adds ${money(addition)} this month, which would take ${org.name} past its ${money(budget)} monthly budget.`,
        },
        { status: 403 }
      );
    }
  }

  let telnyxId: string;
  try {
    const order = await purchaseNumber(available.phoneNumber);
    telnyxId = order.telnyxId;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  }

  // An organization's first number becomes its default caller ID, so its
  // agents can call straight away.
  const { count: activeCount } = await supabaseServiceClient
    .from("phone_numbers")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("is_active", true);

  // The number is bought at this point even if the row below fails to
  // write -- record it even on a partial failure so it isn't silently
  // bought and then lost from the admin's view.
  const { data, error } = await supabaseServiceClient
    .from("phone_numbers")
    .insert([
      {
        phone_number: available.phoneNumber,
        telnyx_id: telnyxId,
        country_code: available.countryCode,
        monthly_cost: available.monthlyCost,
        upfront_cost: available.upfrontCost,
        monthly_price: monthlyPrice,
        upfront_price: upfrontPrice,
        is_active: (activeCount ?? 0) === 0,
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

  await logAudit(actor, orgId, "number.purchased", {
    phone_number: available.phoneNumber,
    telnyx_id: telnyxId,
    monthly_price: monthlyPrice,
    upfront_price: upfrontPrice,
  });

  if (!canSeeCosts(actor)) {
    delete data.monthly_cost;
    delete data.upfront_cost;
  }
  return NextResponse.json({ success: true, number: data });
}

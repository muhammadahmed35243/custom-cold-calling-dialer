import { NextRequest, NextResponse } from "next/server";
import {
  requireRole,
  targetOrgId,
  loadOrganization,
  canBuyNumbers,
  canSeeCosts,
  ADMIN_ROLES,
  BUY_NUMBERS_BLOCKED_MESSAGE,
} from "@/lib/authz";
import { searchAvailableNumbers } from "@/lib/telnyx";
import { numberPrice } from "@/lib/billing";

export async function GET(req: NextRequest) {
  const { actor, error: authError } = await requireRole(req, ADMIN_ROLES);
  if (authError) return authError;

  const orgId = targetOrgId(req, actor);
  const org = orgId === actor.orgId ? actor.org : await loadOrganization(orgId);
  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }
  if (!canBuyNumbers(actor, org)) {
    return NextResponse.json({ error: BUY_NUMBERS_BLOCKED_MESSAGE }, { status: 403 });
  }

  const countryCode = req.nextUrl.searchParams.get("country");
  const areaCode = req.nextUrl.searchParams.get("areaCode") || undefined;
  if (!countryCode) {
    return NextResponse.json({ error: "country is required (2-letter ISO code)" }, { status: 400 });
  }

  try {
    const showCost = canSeeCosts(actor);
    const numbers = (await searchAvailableNumbers(countryCode, areaCode)).map((n) => ({
      phoneNumber: n.phoneNumber,
      phoneNumberType: n.phoneNumberType,
      countryCode: n.countryCode,
      // What this organization pays; Telnyx's own price only for JETZT.
      monthlyPrice: numberPrice(n.monthlyCost, org.number_markup_pct),
      upfrontPrice: numberPrice(n.upfrontCost, org.number_markup_pct),
      ...(showCost ? { monthlyCost: n.monthlyCost, upfrontCost: n.upfrontCost } : {}),
    }));
    return NextResponse.json({ numbers });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  }
}

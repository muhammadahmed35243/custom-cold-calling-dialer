import { NextRequest, NextResponse } from "next/server";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import {
  requireRole,
  targetOrgId,
  loadOrganization,
  canBuyNumbers,
  canSeeCosts,
  ADMIN_ROLES,
  BUY_NUMBERS_BLOCKED_MESSAGE,
} from "@/lib/authz";
import { searchAvailableNumbers, NUMBER_TYPES, NUMBER_FEATURES, type NumberType } from "@/lib/telnyx";
import { numberPrice } from "@/lib/billing";

function bad(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

// Search Telnyx for numbers to buy:
//   country (required, 2 letters), areaCode, city, state, type
//   (local | toll_free | mobile | national), features (comma-separated:
//   sms, mms, fax, emergency) and contains (digits the number must contain).
// Prices are what this organization would pay; Telnyx's own price only for JETZT.
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

  const q = req.nextUrl.searchParams;
  const get = (name: string) => (q.get(name) || "").trim();

  const countryCode = get("country").toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryCode)) return bad("Country must be a 2-letter code, like US or GB");

  const areaCode = get("areaCode");
  if (areaCode && !/^\d{1,5}$/.test(areaCode)) return bad("Area code must be digits only");

  const city = get("city");
  if (city && (city.length > 60 || !/^[\p{L}\s.'-]+$/u.test(city))) return bad("That city name doesn't look right");

  const state = get("state").toUpperCase();
  if (state && !/^[A-Z0-9]{1,6}$/.test(state)) return bad("State must be a short code, like CA or NY");

  const type = get("type");
  if (type && !(NUMBER_TYPES as readonly string[]).includes(type)) return bad("Unknown number type");

  const features = get("features") ? get("features").split(",").map((f) => f.trim()).filter(Boolean) : [];
  if (features.some((f) => !(NUMBER_FEATURES as readonly string[]).includes(f))) return bad("Unknown feature");

  const contains = get("contains");
  if (contains && !/^\d{2,10}$/.test(contains)) return bad("“Contains” must be 2 to 10 digits");

  try {
    const showCost = canSeeCosts(actor);
    const { numbers: found, closeMatches } = await searchAvailableNumbers({
      countryCode,
      areaCode: areaCode || undefined,
      locality: city || undefined,
      administrativeArea: state || undefined,
      numberType: (type || undefined) as NumberType | undefined,
      features,
      contains: contains || undefined,
    });

    const numbers = found.map((n) => ({
      phoneNumber: n.phoneNumber,
      // e.g. "+1 415 294 8144"
      display: parsePhoneNumberFromString(n.phoneNumber)?.formatInternational() ?? n.phoneNumber,
      phoneNumberType: n.phoneNumberType,
      countryCode: n.countryCode,
      locality: n.locality,
      region: n.region,
      rateCenter: n.rateCenter,
      features: n.features,
      bestEffort: n.bestEffort,
      quickship: n.quickship,
      monthlyPrice: numberPrice(n.monthlyCost, org.number_markup_pct),
      upfrontPrice: numberPrice(n.upfrontCost, org.number_markup_pct),
      ...(showCost ? { monthlyCost: n.monthlyCost, upfrontCost: n.upfrontCost } : {}),
    }));
    return NextResponse.json({ numbers, closeMatches });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  }
}

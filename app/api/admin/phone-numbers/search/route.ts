import { NextRequest, NextResponse } from "next/server";
import { requireRole, canBuyNumbers, ADMIN_ROLES, BUY_NUMBERS_BLOCKED_MESSAGE } from "@/lib/authz";
import { searchAvailableNumbers } from "@/lib/telnyx";

export async function GET(req: NextRequest) {
  const { actor, error: authError } = await requireRole(req, ADMIN_ROLES);
  if (authError) return authError;

  // Search results show JETZT's own cost from Telnyx, so they're limited to
  // whoever can buy at that price.
  if (!canBuyNumbers(actor)) {
    return NextResponse.json({ error: BUY_NUMBERS_BLOCKED_MESSAGE }, { status: 403 });
  }

  const countryCode = req.nextUrl.searchParams.get("country");
  const areaCode = req.nextUrl.searchParams.get("areaCode") || undefined;
  if (!countryCode) {
    return NextResponse.json({ error: "country is required (2-letter ISO code)" }, { status: 400 });
  }

  try {
    const numbers = await searchAvailableNumbers(countryCode, areaCode);
    return NextResponse.json({ numbers });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  }
}

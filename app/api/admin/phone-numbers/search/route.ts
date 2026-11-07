import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/voice-agent/admin-auth";
import { searchAvailableNumbers } from "@/lib/telnyx";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

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

import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/voice-agent/admin-auth";
import { purchaseNumber } from "@/lib/telnyx";

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

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
        purchased_by: auth.email,
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

  return NextResponse.json({ success: true, number: data });
}

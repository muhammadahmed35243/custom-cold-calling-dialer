import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { validateAndFormatPhone } from "@/lib/phone";

// Self-service: an agent can change their own phone_number (the number
// dialed first in Phone mode) without needing an admin to do it via the
// admin panel. Deliberately doesn't touch role/is_active/alias_email --
// those stay admin-only, unlike the full /api/agents/[id] route.
export async function PATCH(req: NextRequest) {
  const { user } = await getAuthenticatedUser(req);
  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { phone_number } = await req.json();
    if (!phone_number) {
      return NextResponse.json({ error: "Phone number is required" }, { status: 400 });
    }

    const phoneResult = validateAndFormatPhone(phone_number);
    if (!phoneResult.valid || !phoneResult.formatted) {
      return NextResponse.json({ error: phoneResult.error || "Invalid phone number" }, { status: 400 });
    }

    const { data, error } = await supabaseServiceClient
      .from("agents")
      .update({ phone_number: phoneResult.formatted })
      .eq("email", user.email)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, agent: data });
  } catch (error) {
    return NextResponse.json(
      { error: `Server error: ${error}` },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/voice-agent/admin-auth";

// Sets this number as the default outbound caller ID for any agent without
// a specific number assignment. Only one row can be active at a time (a DB
// constraint enforces that), so clear the current one first.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const { error: clearError } = await supabaseServiceClient
    .from("phone_numbers")
    .update({ is_active: false })
    .eq("is_active", true);
  if (clearError) {
    return NextResponse.json({ error: clearError.message }, { status: 500 });
  }

  const { error } = await supabaseServiceClient
    .from("phone_numbers")
    .update({ is_active: true })
    .eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/voice-agent/admin-auth";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const { data, error } = await supabaseServiceClient
    .from("phone_numbers")
    .select("*")
    .order("purchased_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ numbers: data });
}

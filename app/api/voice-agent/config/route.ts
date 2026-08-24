import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/voice-agent/admin-auth";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const { data, error } = await supabaseServiceClient
    .from("agent_config")
    .select("key, value, updated_at")
    .in("key", ["core_instructions", "timely_info"]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ config: data });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const { key, value } = await req.json();
  if (key !== "core_instructions" && key !== "timely_info") {
    return NextResponse.json({ error: "Invalid key" }, { status: 400 });
  }

  const { error } = await supabaseServiceClient
    .from("agent_config")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

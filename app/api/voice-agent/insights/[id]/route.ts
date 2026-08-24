import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/voice-agent/admin-auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const { action } = await req.json();
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "action must be approve or reject" }, { status: 400 });
  }

  const { data: insight, error: fetchError } = await supabaseServiceClient
    .from("insights")
    .select("*")
    .eq("id", params.id)
    .single();

  if (fetchError || !insight) {
    return NextResponse.json({ error: "Insight not found" }, { status: 404 });
  }
  if (insight.status !== "pending") {
    return NextResponse.json({ error: "Already resolved" }, { status: 409 });
  }

  // Approving an instruction_change is what actually applies it — this is
  // the one place in the whole system a suggested behavior change takes
  // effect, and it only happens here, from an explicit admin action.
  if (action === "approve" && insight.kind === "instruction_change") {
    const { data: current } = await supabaseServiceClient
      .from("agent_config")
      .select("value")
      .eq("key", "core_instructions")
      .single();

    const merged = current?.value ? `${current.value}\n${insight.content}` : insight.content;

    const { error: updateError } = await supabaseServiceClient
      .from("agent_config")
      .upsert(
        { key: "core_instructions", value: merged, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const { error } = await supabaseServiceClient
    .from("insights")
    .update({
      status: action === "approve" ? "approved" : "rejected",
      resolved_at: new Date().toISOString(),
    })
    .eq("id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

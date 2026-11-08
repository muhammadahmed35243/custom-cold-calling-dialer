import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import { getActor } from "@/lib/authz";
import { moveLeadAfterCall } from "@/lib/leads";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { actor, error: authError } = await getActor(req);
  if (authError) return authError;

  try {
    const { disposition, notes, callbackAt } = await req.json();

    const { data: call, error: callError } = await supabaseServiceClient
      .from("calls")
      .select("*")
      .eq("id", params.id)
      .eq("agent_email", actor.email)
      .single();

    if (callError || !call) {
      return NextResponse.json({ error: "Call not found" }, { status: 404 });
    }

    const { error: updateError } = await supabaseServiceClient
      .from("calls")
      .update({
        disposition,
        notes,
        callback_at: callbackAt || null,
      })
      .eq("id", params.id);

    if (updateError) {
      return NextResponse.json(
        { error: `Update failed: ${updateError.message}` },
        { status: 500 }
      );
    }

    // The lead follows the outcome of its latest call: connected -> called,
    // callback -> callback, no answer / busy / voicemail -> back in the queue
    // until tried 3 times. Editing an older call doesn't move the lead.
    try {
      await moveLeadAfterCall(call.id, { disposition });
    } catch (err) {
      return NextResponse.json(
        { error: `Lead update failed: ${err instanceof Error ? err.message : String(err)}` },
        { status: 500 }
      );
    }

    // Same order as the dialer's queue: never-tried leads first, then the
    // retry that has waited longest.
    const { data: nextLeads } = await supabaseServiceClient
      .from("leads")
      .select("*")
      .eq("status", "pending")
      .eq("org_id", actor.orgId)
      .eq("owner_email", actor.email)
      .order("last_called_at", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: true })
      .limit(1);

    return NextResponse.json({ success: true, nextLead: nextLeads?.[0] || null });
  } catch (error) {
    return NextResponse.json(
      { error: `Server error: ${error}` },
      { status: 500 }
    );
  }
}

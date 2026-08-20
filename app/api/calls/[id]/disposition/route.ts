import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import { getAuthenticatedUser } from "@/lib/api-auth";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { user } = await getAuthenticatedUser(req);
  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { disposition, notes, callbackAt } = await req.json();

    const { data: call, error: callError } = await supabaseServiceClient
      .from("calls")
      .select("*")
      .eq("id", params.id)
      .eq("agent_email", user.email)
      .single();

    if (callError || !call) {
      return NextResponse.json({ error: "Call not found" }, { status: 404 });
    }

    const isFirstDisposition = !call.disposition;

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

    let nextLead = null;

    // Only advance the queue the first time this call is dispositioned --
    // re-editing a past row (via the table's Edit button) shouldn't re-lock
    // or re-release the lead.
    if (isFirstDisposition) {
      const leadStatus = disposition === "callback" ? "callback" : "called";

      const { error: leadError } = await supabaseServiceClient
        .from("leads")
        .update({ status: leadStatus, assigned_agent: null })
        .eq("id", call.lead_id);

      if (leadError) {
        return NextResponse.json(
          { error: `Lead update failed: ${leadError.message}` },
          { status: 500 }
        );
      }

      const { data: nextLeads } = await supabaseServiceClient
        .from("leads")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(1);

      nextLead = nextLeads?.[0] || null;
    }

    return NextResponse.json({ success: true, nextLead });
  } catch (error) {
    return NextResponse.json(
      { error: `Server error: ${error}` },
      { status: 500 }
    );
  }
}

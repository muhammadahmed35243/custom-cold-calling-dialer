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

    // Get the call record
    const { data: calls, error: callError } = await supabaseServiceClient
      .from("calls")
      .select("*")
      .eq("lead_id", params.id)
      .order("created_at", { ascending: false })
      .limit(1);

    if (callError || !calls || calls.length === 0) {
      return NextResponse.json({ error: "Call not found" }, { status: 404 });
    }

    const callId = calls[0].id;

    // Update call with disposition
    const { error: updateError } = await supabaseServiceClient
      .from("calls")
      .update({
        disposition,
        notes,
        callback_at: callbackAt || null,
      })
      .eq("id", callId);

    if (updateError) {
      return NextResponse.json(
        { error: `Update failed: ${updateError.message}` },
        { status: 500 }
      );
    }

    // Mark lead as called and release lock
    const { error: leadError } = await supabaseServiceClient
      .from("leads")
      .update({
        status: "called",
        assigned_agent: null,
      })
      .eq("id", params.id);

    if (leadError) {
      return NextResponse.json(
        { error: `Lead update failed: ${leadError.message}` },
        { status: 500 }
      );
    }

    // Get next pending lead
    const { data: nextLead } = await supabaseServiceClient
      .from("leads")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(1);

    return NextResponse.json({
      success: true,
      nextLead: nextLead?.[0] || null,
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Server error: ${error}` },
      { status: 500 }
    );
  }
}

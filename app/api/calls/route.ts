import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { initiateCall } from "@/lib/telnyx";

export async function POST(req: NextRequest) {
  const { user } = await getAuthenticatedUser(req);
  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get agent details
  const { data: agent } = await supabaseServiceClient
    .from("agents")
    .select("phone_number")
    .eq("email", user.email)
    .single();

  if (!agent?.phone_number) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  try {
    const { leadId } = await req.json();

    // Get the lead
    const { data: leadData, error: leadError } = await supabaseServiceClient
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .single();

    if (leadError || !leadData) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    // Database-first: create calls record with status=initiating
    const { data: callRecord, error: createError } = await supabaseServiceClient
      .from("calls")
      .insert([
        {
          lead_id: leadId,
          agent_email: user.email,
          started_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (createError || !callRecord) {
      return NextResponse.json(
        { error: `Failed to create call record: ${createError?.message}` },
        { status: 500 }
      );
    }

    // Mark lead as in_progress with assigned agent
    const { error: lockError } = await supabaseServiceClient
      .from("leads")
      .update({
        status: "in_progress",
        assigned_agent: user.email,
      })
      .eq("id", leadId);

    if (lockError) {
      return NextResponse.json(
        { error: `Failed to lock lead: ${lockError.message}` },
        { status: 500 }
      );
    }

    // Now call Telnyx
    try {
      const providerCall = await initiateCall(agent.phone_number, callRecord.id);

      // Update call record with the provider's call SID
      const { error: updateError } = await supabaseServiceClient
        .from("calls")
        .update({ twilio_call_sid: providerCall.sid })
        .eq("id", callRecord.id);

      if (updateError) {
        return NextResponse.json(
          { error: `Failed to update call SID: ${updateError.message}` },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        call: { ...callRecord, twilio_call_sid: providerCall.sid },
      });
    } catch (callError) {
      console.error("Telnyx error:", callError);
      // Revert lead lock on call-provider failure
      await supabaseServiceClient
        .from("leads")
        .update({
          status: "pending",
          assigned_agent: null,
        })
        .eq("id", leadId);

      return NextResponse.json(
        { error: `Telnyx error: ${callError instanceof Error ? callError.message : String(callError)}` },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: `Server error: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}

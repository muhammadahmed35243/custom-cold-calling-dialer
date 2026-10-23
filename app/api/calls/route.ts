import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { initiateCall } from "@/lib/telnyx";

export async function GET(req: NextRequest) {
  const { user } = await getAuthenticatedUser(req);
  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Joined via service role: the leads RLS policy only allows reading
  // status='pending' rows, which would silently drop the name/phone for
  // every already-called lead if this ran through the client's anon key.
  const { data, error } = await supabaseServiceClient
    .from("calls")
    .select("*, leads(id, name, phone, email)")
    .eq("agent_email", user.email)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ calls: data });
}

export async function POST(req: NextRequest) {
  const { user } = await getAuthenticatedUser(req);
  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get agent details
  const { data: agent } = await supabaseServiceClient
    .from("agents")
    .select("phone_number, role")
    .eq("email", user.email)
    .single();

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  try {
    const { leadId, mode } = await req.json();

    // Phone-bridge rings the agent's own phone, so it's the only mode that
    // needs a number on file. Checked before any writes so a missing number
    // doesn't leave the lead locked.
    if (mode !== "webrtc" && !agent.phone_number) {
      return NextResponse.json(
        { error: "Add your phone number to call by phone, or use Browser mode" },
        { status: 400 }
      );
    }

    // Get the lead
    const { data: leadData, error: leadError } = await supabaseServiceClient
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .single();

    // Agents may only dial leads they own; admins can dial any lead. Same
    // 404 as a missing lead so other agents' lead IDs can't be probed.
    if (leadError || !leadData || (agent.role !== "admin" && leadData.owner_email !== user.email)) {
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

    // WebRTC mode: the browser places the call directly via the SDK --
    // nothing for the server to dial. Just hand back the row so the
    // frontend can link its WebRTC call to it and report the outcome to
    // /api/calls/[id]/webrtc-complete once it ends.
    if (mode === "webrtc") {
      return NextResponse.json({ success: true, call: callRecord });
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

import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import { getAuthenticatedUser } from "@/lib/api-auth";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { user } = await getAuthenticatedUser(req);
  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { data: call, error } = await supabaseServiceClient
      .from("calls")
      .select("*")
      .eq("id", params.id)
      .single();

    if (error || !call) {
      return NextResponse.json({ error: "Call not found" }, { status: 404 });
    }

    let status = "initiated";
    if (call.agent_call_status === "completed" && call.lead_call_status === "completed") {
      status = "completed";
    } else if (call.agent_call_status === "ringing") {
      status = "ringing";
    } else if (call.agent_call_status === "no_answer") {
      status = "no_answer";
    } else if (call.agent_call_status === "failed") {
      status = "failed";
    }

    return NextResponse.json({ call, status });
  } catch (error) {
    return NextResponse.json(
      { error: `Server error: ${error}` },
      { status: 500 }
    );
  }
}

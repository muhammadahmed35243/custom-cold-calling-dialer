import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { sendMail } from "@/lib/mailer";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { user } = await getAuthenticatedUser(req);
  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { subject, body } = await req.json();
    if (!subject || !body) {
      return NextResponse.json({ error: "Subject and body are required" }, { status: 400 });
    }

    const { data: call, error: callError } = await supabaseServiceClient
      .from("calls")
      .select("*, leads(email)")
      .eq("id", params.id)
      .eq("agent_email", user.email)
      .single();

    if (callError || !call) {
      return NextResponse.json({ error: "Call not found" }, { status: 404 });
    }

    if (!call.leads?.email) {
      return NextResponse.json({ error: "This lead has no email on file" }, { status: 400 });
    }

    await sendMail(call.leads.email, subject, body);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to send: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { sendMail } from "@/lib/mailer";

export async function POST(req: NextRequest) {
  const { user } = await getAuthenticatedUser(req);
  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: agent } = await supabaseServiceClient
    .from("agents")
    .select("role, alias_email, display_name")
    .eq("email", user.email)
    .single();

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  if (agent.role !== "admin" && !agent.alias_email) {
    return NextResponse.json(
      { error: "No mailbox alias assigned -- contact your admin" },
      { status: 403 }
    );
  }

  try {
    const { to, subject, body } = await req.json();
    if (!to || !subject || !body) {
      return NextResponse.json({ error: "To, subject, and body are required" }, { status: 400 });
    }

    const fromOverride = agent.alias_email
      ? { name: agent.display_name, address: agent.alias_email }
      : undefined;

    await sendMail(to, subject, body, fromOverride);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to send: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { listMessages } from "@/lib/mailer";

export async function GET(req: NextRequest) {
  const { user } = await getAuthenticatedUser(req);
  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: agent } = await supabaseServiceClient
    .from("agents")
    .select("role, alias_email")
    .eq("email", user.email)
    .single();

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  // An agent with no alias assigned has no mailbox to view at all, not
  // just nothing to show.
  if (agent.role !== "admin" && !agent.alias_email) {
    return NextResponse.json(
      { error: "No mailbox alias assigned -- contact your admin" },
      { status: 403 }
    );
  }

  const folder = req.nextUrl.searchParams.get("folder") || "Inbox";
  const beforeUidParam = req.nextUrl.searchParams.get("beforeUid");
  const beforeUid = beforeUidParam ? parseInt(beforeUidParam, 10) : undefined;

  try {
    const messages = await listMessages(folder, {
      filterAddress: agent.role === "admin" ? undefined : agent.alias_email!,
      limit: 50,
      beforeUid,
    });
    return NextResponse.json({ messages });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

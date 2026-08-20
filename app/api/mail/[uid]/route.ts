import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { getMessage } from "@/lib/mailer";

export async function GET(
  req: NextRequest,
  { params }: { params: { uid: string } }
) {
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

  if (agent.role !== "admin" && !agent.alias_email) {
    return NextResponse.json(
      { error: "No mailbox alias assigned -- contact your admin" },
      { status: 403 }
    );
  }

  const folder = req.nextUrl.searchParams.get("folder") || "Inbox";
  const uid = parseInt(params.uid, 10);

  try {
    const message = await getMessage(folder, uid);

    // Re-check permission server-side even though the list was already
    // filtered -- don't trust a UID isn't guessed/enumerated.
    if (agent.role !== "admin") {
      const alias = agent.alias_email!.toLowerCase();
      const involvesAlias =
        message.from.toLowerCase().includes(alias) || message.to.toLowerCase().includes(alias);
      if (!involvesAlias) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
    }

    return NextResponse.json({ message });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

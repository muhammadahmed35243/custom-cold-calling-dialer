import { NextRequest, NextResponse } from "next/server";
import { getMailboxUser } from "@/lib/mail-access";
import { getMessage } from "@/lib/mailer";

export async function GET(
  req: NextRequest,
  { params }: { params: { uid: string } }
) {
  const { user, error: accessError } = await getMailboxUser(req);
  if (accessError) return accessError;

  const folder = req.nextUrl.searchParams.get("folder") || "Inbox";
  const uid = parseInt(params.uid, 10);

  try {
    const message = await getMessage(folder, uid);

    // Re-check permission server-side even though the list was already
    // filtered -- don't trust a UID isn't guessed/enumerated.
    if (!user.isAdmin) {
      const alias = user.aliasEmail!.toLowerCase();
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

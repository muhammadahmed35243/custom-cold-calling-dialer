import { NextRequest, NextResponse } from "next/server";
import { getMailContext, handleMailboxFailure, mailboxErrorResponse } from "@/lib/mailboxes";
import { getMessage, MAIL_FOLDERS, type MailFolder } from "@/lib/mailer";

export async function GET(
  req: NextRequest,
  { params }: { params: { uid: string } }
) {
  const { context, error: accessError } = await getMailContext(req);
  if (accessError) return accessError;

  const folderParam = req.nextUrl.searchParams.get("folder") || "Inbox";
  if (!(MAIL_FOLDERS as readonly string[]).includes(folderParam)) {
    return NextResponse.json({ error: "Unknown folder" }, { status: 400 });
  }
  const uid = parseInt(params.uid, 10);
  if (!Number.isInteger(uid) || uid <= 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const message = await getMessage(context.mailbox, folderParam as MailFolder, uid);

    // Re-check permission server-side even though the list was already
    // filtered -- don't trust a UID isn't guessed/enumerated.
    if (context.filterAddress) {
      const alias = context.filterAddress.toLowerCase();
      const involvesAlias =
        message.from.toLowerCase().includes(alias) || message.to.toLowerCase().includes(alias);
      if (!involvesAlias) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
    }

    return NextResponse.json({ message });
  } catch (err) {
    return mailboxErrorResponse(await handleMailboxFailure(context.row, err));
  }
}

// Mail servers can be slow to answer.
export const maxDuration = 60;

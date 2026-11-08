import { NextRequest, NextResponse } from "next/server";
import { getMailContext, handleMailboxFailure, mailboxErrorResponse } from "@/lib/mailboxes";
import { listMessages, MAIL_FOLDERS, type MailFolder } from "@/lib/mailer";

// The messages in one folder of the user's mailbox (their own, or their
// organization's shared one -- filtered to their alias for agents).
export async function GET(req: NextRequest) {
  const { context, error: accessError } = await getMailContext(req);
  if (accessError) return accessError;

  const folderParam = req.nextUrl.searchParams.get("folder") || "Inbox";
  if (!(MAIL_FOLDERS as readonly string[]).includes(folderParam)) {
    return NextResponse.json({ error: "Unknown folder" }, { status: 400 });
  }
  const beforeUidParam = req.nextUrl.searchParams.get("beforeUid");
  const beforeUid = beforeUidParam ? parseInt(beforeUidParam, 10) : undefined;

  try {
    const messages = await listMessages(context.mailbox, folderParam as MailFolder, {
      filterAddress: context.filterAddress ?? undefined,
      limit: 50,
      beforeUid,
    });
    return NextResponse.json({
      messages,
      // Which mailbox this is, so the page can say so.
      mailbox: { email: context.mailbox.email, source: context.source, filter: context.filterAddress },
    });
  } catch (err) {
    return mailboxErrorResponse(await handleMailboxFailure(context.row, err));
  }
}

// Mail servers can be slow to answer.
export const maxDuration = 60;

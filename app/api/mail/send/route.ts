import { NextRequest, NextResponse } from "next/server";
import { getMailContext, handleMailboxFailure, mailboxErrorResponse, MailboxError } from "@/lib/mailboxes";
import { sendMail } from "@/lib/mailer";

export async function POST(req: NextRequest) {
  const { context, error: accessError } = await getMailContext(req);
  if (accessError) return accessError;

  const { to, subject, body } = await req.json().catch(() => ({}));
  if (!to || !subject || !body) {
    return NextResponse.json({ error: "To, subject, and body are required" }, { status: 400 });
  }

  try {
    await sendMail(context.mailbox, { to, subject, text: body, from: context.sendAs });
    return NextResponse.json({ success: true });
  } catch (err) {
    const failure = await handleMailboxFailure(context.row, err);
    if (failure instanceof MailboxError) return mailboxErrorResponse(failure);
    return NextResponse.json(
      { error: `Failed to send: ${failure instanceof Error ? failure.message : String(failure)}` },
      { status: 500 }
    );
  }
}

// Mail servers can be slow to answer.
export const maxDuration = 60;

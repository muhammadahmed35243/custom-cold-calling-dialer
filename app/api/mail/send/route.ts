import { NextRequest, NextResponse } from "next/server";
import { getMailboxUser } from "@/lib/mail-access";
import { sendMail } from "@/lib/mailer";

export async function POST(req: NextRequest) {
  const { user, error: accessError } = await getMailboxUser(req);
  if (accessError) return accessError;

  try {
    const { to, subject, body } = await req.json();
    if (!to || !subject || !body) {
      return NextResponse.json({ error: "To, subject, and body are required" }, { status: 400 });
    }

    const fromOverride = user.aliasEmail
      ? { name: user.displayName, address: user.aliasEmail }
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

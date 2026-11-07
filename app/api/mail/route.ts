import { NextRequest, NextResponse } from "next/server";
import { getMailboxUser } from "@/lib/mail-access";
import { listMessages } from "@/lib/mailer";

export async function GET(req: NextRequest) {
  const { user, error: accessError } = await getMailboxUser(req);
  if (accessError) return accessError;

  const folder = req.nextUrl.searchParams.get("folder") || "Inbox";
  const beforeUidParam = req.nextUrl.searchParams.get("beforeUid");
  const beforeUid = beforeUidParam ? parseInt(beforeUidParam, 10) : undefined;

  try {
    const messages = await listMessages(folder, {
      filterAddress: user.isAdmin ? undefined : user.aliasEmail!,
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

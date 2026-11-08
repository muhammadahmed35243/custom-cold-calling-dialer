import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import { getMailContext, handleMailboxFailure, mailboxErrorResponse, MailboxError } from "@/lib/mailboxes";
import { sendMail } from "@/lib/mailer";

// Sends a call's follow-up email from the agent's mailbox: their own if
// they've connected one, otherwise their organization's shared mailbox (as
// their alias, when they have one).
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { context, error: accessError } = await getMailContext(req);
  if (accessError) return accessError;

  const { subject, body } = await req.json().catch(() => ({}));
  if (!subject || !body) {
    return NextResponse.json({ error: "Subject and body are required" }, { status: 400 });
  }

  const { data: call, error: callError } = await supabaseServiceClient
    .from("calls")
    .select("id, leads(email)")
    .eq("id", params.id)
    .eq("agent_email", context.actor.email)
    .single();

  if (callError || !call) {
    return NextResponse.json({ error: "Call not found" }, { status: 404 });
  }

  const lead = Array.isArray(call.leads) ? call.leads[0] : call.leads;
  if (!lead?.email) {
    return NextResponse.json({ error: "This lead has no email on file" }, { status: 400 });
  }

  try {
    await sendMail(context.mailbox, { to: lead.email, subject, text: body, from: context.sendAs });
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

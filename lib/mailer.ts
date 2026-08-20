import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import sanitizeHtml from "sanitize-html";

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransporter() {
  if (transporter) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASSWORD) {
    throw new Error("SMTP is not configured (missing SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASSWORD)");
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
  });

  return transporter;
}

function getImapClient() {
  const { SMTP_HOST, SMTP_USER, SMTP_PASSWORD } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD) {
    throw new Error("SMTP is not configured (missing SMTP_HOST/SMTP_USER/SMTP_PASSWORD)");
  }

  return new ImapFlow({
    host: SMTP_HOST,
    port: 993,
    secure: true,
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
    logger: false,
  });
}

// Plain SMTP submission has no concept of "save a copy to Sent" -- that's
// normally the sending client's job (webmail does both at once). Since we
// send via raw SMTP, we have to explicitly file a copy over IMAP ourselves
// or sent mail never shows up in the mailbox's own Sent folder.
async function appendToSent(raw: Buffer) {
  const client = getImapClient();
  await client.connect();
  try {
    await client.append("Sent", raw, ["\\Seen"]);
  } finally {
    await client.logout();
  }
}

export async function sendMail(
  to: string,
  subject: string,
  text: string,
  from?: { name: string; address: string }
) {
  const fromName = from?.name || process.env.SMTP_FROM_NAME || "JETZT";
  // Auth always uses the one shared mailbox account -- only the From header
  // changes per agent. Since alias addresses share the same domain as the
  // authenticated mailbox, this stays SPF/DKIM-domain-aligned.
  const fromAddress = from?.address || process.env.SMTP_USER;
  const mailOptions = {
    from: `"${fromName}" <${fromAddress}>`,
    to,
    subject,
    text,
  };

  await getTransporter().sendMail(mailOptions);

  try {
    const raw: Buffer = await new Promise((resolve, reject) => {
      new MailComposer(mailOptions).compile().build((err, message) => {
        if (err) reject(err);
        else resolve(message);
      });
    });
    await appendToSent(raw);
  } catch (err) {
    // The email itself already went out -- don't fail the whole send just
    // because filing a copy into Sent didn't work.
    console.error("Failed to file sent email into Sent folder:", err);
  }
}

export type MessageSummary = {
  uid: number;
  subject: string;
  from: string;
  to: string;
  date: string | null;
  seen: boolean;
  hasAttachments: boolean;
};

function structureHasAttachment(node: any): boolean {
  if (!node) return false;
  if (node.disposition === "attachment") return true;
  if (Array.isArray(node.childNodes)) {
    return node.childNodes.some(structureHasAttachment);
  }
  return false;
}

export async function listMessages(
  folder: string,
  opts: { filterAddress?: string; limit?: number; beforeUid?: number } = {}
): Promise<MessageSummary[]> {
  const client = getImapClient();
  await client.connect();

  try {
    await client.mailboxOpen(folder, { readOnly: true });

    const searchQuery = opts.filterAddress
      ? { or: [{ to: opts.filterAddress }, { from: opts.filterAddress }, { cc: opts.filterAddress }] }
      : { all: true };

    const found = await client.search(searchQuery, { uid: true });
    let uids = (found || []) as number[];
    uids.sort((a, b) => b - a);

    if (opts.beforeUid) {
      uids = uids.filter((uid) => uid < opts.beforeUid!);
    }

    const pageUids = uids.slice(0, opts.limit || 50);
    if (pageUids.length === 0) return [];

    const summaries: MessageSummary[] = [];
    for await (const msg of client.fetch(
      pageUids,
      { envelope: true, flags: true, bodyStructure: true },
      { uid: true }
    )) {
      summaries.push({
        uid: msg.uid,
        subject: msg.envelope?.subject || "(no subject)",
        from: msg.envelope?.from?.[0]?.address || "",
        to: (msg.envelope?.to || []).map((t) => t.address).filter(Boolean).join(", "),
        date: msg.envelope?.date ? new Date(msg.envelope.date).toISOString() : null,
        seen: msg.flags ? msg.flags.has("\\Seen") : false,
        hasAttachments: structureHasAttachment(msg.bodyStructure),
      });
    }

    summaries.sort((a, b) => b.uid - a.uid);
    return summaries;
  } finally {
    await client.logout();
  }
}

export type ParsedMessage = {
  uid: number;
  subject: string;
  from: string;
  to: string;
  date: string | null;
  text: string;
  html: string | null;
  attachments: { filename: string; size: number }[];
};

export async function getMessage(folder: string, uid: number): Promise<ParsedMessage> {
  const client = getImapClient();
  await client.connect();

  try {
    await client.mailboxOpen(folder, { readOnly: true });

    const { content } = await client.download(String(uid), undefined, { uid: true });
    const chunks: Buffer[] = [];
    for await (const chunk of content) chunks.push(chunk as Buffer);
    const raw = Buffer.concat(chunks);

    const parsed = await simpleParser(raw);
    const html = parsed.html
      ? sanitizeHtml(parsed.html, {
          allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]),
          allowedAttributes: { ...sanitizeHtml.defaults.allowedAttributes, img: ["src", "alt"] },
        })
      : null;

    const toField = Array.isArray(parsed.to)
      ? parsed.to.map((t) => t.text).join(", ")
      : parsed.to?.text || "";

    return {
      uid,
      subject: parsed.subject || "(no subject)",
      from: parsed.from?.text || "",
      to: toField,
      date: parsed.date ? parsed.date.toISOString() : null,
      text: parsed.text || "",
      html,
      attachments: (parsed.attachments || []).map((a) => ({
        filename: a.filename || "attachment",
        size: a.size,
      })),
    };
  } finally {
    await client.logout();
  }
}

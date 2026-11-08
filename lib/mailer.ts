import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import sanitizeHtml from "sanitize-html";

// Sending and reading mail through one mailbox: an organization's or agent's
// connected mailbox (lib/mailboxes.ts resolves which), or JETZT's original
// SMTP_* mailbox.

export type MailboxAuth = { user: string; pass: string } | { user: string; accessToken: string };

export type MailboxConfig = {
  email: string;
  displayName: string | null;
  smtp: { host: string; port: number; secure: boolean };
  imap: { host: string; port: number };
  auth: MailboxAuth;
  // Gmail files sent mail into Sent by itself; for everyone else a copy has
  // to be appended over IMAP or sent mail never shows up there.
  savesSentItself: boolean;
};

// The mail screens' folders; each mailbox may call them something else.
export const MAIL_FOLDERS = ["Inbox", "Sent", "Drafts"] as const;
export type MailFolder = (typeof MAIL_FOLDERS)[number];

// JETZT's original mailbox from the SMTP_* environment variables, if set.
export function envMailbox(): MailboxConfig | null {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM_NAME } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD) return null;
  const port = Number(SMTP_PORT || 465);
  return {
    email: SMTP_USER,
    displayName: SMTP_FROM_NAME || "JETZT",
    smtp: { host: SMTP_HOST, port, secure: port === 465 },
    imap: { host: SMTP_HOST, port: 993 },
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
    savesSentItself: false,
  };
}

function transportFor(mailbox: MailboxConfig) {
  return nodemailer.createTransport({
    host: mailbox.smtp.host,
    port: mailbox.smtp.port,
    secure: mailbox.smtp.secure,
    auth:
      "accessToken" in mailbox.auth
        ? { type: "OAuth2", user: mailbox.auth.user, accessToken: mailbox.auth.accessToken }
        : { user: mailbox.auth.user, pass: mailbox.auth.pass },
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 30000,
  });
}

function imapFor(mailbox: MailboxConfig) {
  return new ImapFlow({
    host: mailbox.imap.host,
    port: mailbox.imap.port,
    // 993 is TLS from the start; anything else upgrades with STARTTLS.
    secure: mailbox.imap.port === 993,
    auth:
      "accessToken" in mailbox.auth
        ? { user: mailbox.auth.user, accessToken: mailbox.auth.accessToken }
        : { user: mailbox.auth.user, pass: mailbox.auth.pass },
    logger: false,
    connectionTimeout: 15000,
  });
}

// The mailbox's real path for a folder: Gmail's Sent is "[Gmail]/Sent Mail",
// some servers use "INBOX.Sent", most "Sent". Uses the server's own
// special-use flags first, then common names.
async function folderPath(client: ImapFlow, folder: MailFolder): Promise<string> {
  if (folder === "Inbox") return "INBOX";
  const list = await client.list();
  const flag = folder === "Sent" ? "\\Sent" : "\\Drafts";
  const flagged = list.find((box) => box.specialUse === flag);
  if (flagged) return flagged.path;
  const names = folder === "Sent" ? ["sent", "sent items", "sent mail", "inbox.sent"] : ["drafts", "inbox.drafts"];
  const named = list.find((box) => names.includes(box.path.toLowerCase()) || names.includes(box.name.toLowerCase()));
  return named ? named.path : folder;
}

// Checks the details work (SMTP sign-in, then IMAP sign-in) before they're saved.
export async function testMailbox(mailbox: MailboxConfig): Promise<void> {
  await transportFor(mailbox).verify();
  const client = imapFor(mailbox);
  await client.connect();
  await client.logout();
}

async function appendToSent(mailbox: MailboxConfig, raw: Buffer) {
  const client = imapFor(mailbox);
  await client.connect();
  try {
    await client.append(await folderPath(client, "Sent"), raw, ["\\Seen"]);
  } finally {
    await client.logout();
  }
}

export type OutgoingMail = {
  to: string;
  subject: string;
  text: string;
  // Defaults to the mailbox's own name and address; agents on a shared
  // mailbox send as their alias.
  from?: { name: string; address: string };
  // Where a reply goes (e.g. the person who wrote in).
  replyTo?: string;
  // false for notifications that shouldn't clutter the Sent folder.
  saveToSent?: boolean;
};

export async function sendMail(mailbox: MailboxConfig, mail: OutgoingMail) {
  const fromName = mail.from?.name || mailbox.displayName || "JETZT";
  const fromAddress = mail.from?.address || mailbox.email;
  const mailOptions = {
    from: `"${fromName.replace(/"/g, "'")}" <${fromAddress}>`,
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    ...(mail.replyTo ? { replyTo: mail.replyTo } : {}),
  };

  await transportFor(mailbox).sendMail(mailOptions);
  if (mail.saveToSent === false || mailbox.savesSentItself) return;

  try {
    const raw: Buffer = await new Promise((resolve, reject) => {
      new MailComposer(mailOptions).compile().build((err, message) => {
        if (err) reject(err);
        else resolve(message);
      });
    });
    await appendToSent(mailbox, raw);
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
  mailbox: MailboxConfig,
  folder: MailFolder,
  opts: { filterAddress?: string; limit?: number; beforeUid?: number } = {}
): Promise<MessageSummary[]> {
  const client = imapFor(mailbox);
  await client.connect();

  try {
    await client.mailboxOpen(await folderPath(client, folder), { readOnly: true });

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

export async function getMessage(mailbox: MailboxConfig, folder: MailFolder, uid: number): Promise<ParsedMessage> {
  const client = imapFor(mailbox);
  await client.connect();

  try {
    await client.mailboxOpen(await folderPath(client, folder), { readOnly: true });

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

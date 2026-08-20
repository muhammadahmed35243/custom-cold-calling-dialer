import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer";
import { ImapFlow } from "imapflow";

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

// Plain SMTP submission has no concept of "save a copy to Sent" -- that's
// normally the sending client's job (webmail does both at once). Since we
// send via raw SMTP, we have to explicitly file a copy over IMAP ourselves
// or sent mail never shows up in the mailbox's own Sent folder.
async function appendToSent(raw: Buffer) {
  const { SMTP_HOST, SMTP_USER, SMTP_PASSWORD } = process.env;

  const client = new ImapFlow({
    host: SMTP_HOST!,
    port: 993,
    secure: true,
    auth: { user: SMTP_USER!, pass: SMTP_PASSWORD! },
    logger: false,
  });

  await client.connect();
  try {
    await client.append("Sent", raw, ["\\Seen"]);
  } finally {
    await client.logout();
  }
}

export async function sendMail(to: string, subject: string, text: string) {
  const fromName = process.env.SMTP_FROM_NAME || "JETZT";
  const fromAddress = process.env.SMTP_USER;
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

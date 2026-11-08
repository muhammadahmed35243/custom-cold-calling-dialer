// Mail providers people connect with a password or app password. Safe to use
// in the browser (no secrets). Hosts and ports are the providers' own
// published SMTP/IMAP settings.

export type MailPreset = {
  id: string;
  label: string;
  hint: string;
  smtpHost: string;
  smtpPort: number;
  // true: TLS from the start (port 465); false: STARTTLS (port 587).
  smtpSecure: boolean;
  imapHost: string;
  imapPort: number;
};

export const MAIL_PRESETS: MailPreset[] = [
  {
    id: "google",
    label: "Gmail / Google Workspace (app password)",
    hint: "Needs 2-Step Verification. Create an app password at myaccount.google.com/apppasswords and paste it here. Some Workspace admins turn app passwords off.",
    smtpHost: "smtp.gmail.com",
    smtpPort: 465,
    smtpSecure: true,
    imapHost: "imap.gmail.com",
    imapPort: 993,
  },
  {
    id: "privateemail",
    label: "Namecheap Private Email (privateemail.com)",
    hint: "Use the full email address and its mailbox password.",
    smtpHost: "mail.privateemail.com",
    smtpPort: 465,
    smtpSecure: true,
    imapHost: "mail.privateemail.com",
    imapPort: 993,
  },
  {
    id: "zoho",
    label: "Zoho Mail",
    hint: "Turn on IMAP access in Zoho Mail settings. With 2-factor sign-in, use an app-specific password. Accounts on zoho.eu or zoho.in: choose Other.",
    smtpHost: "smtp.zoho.com",
    smtpPort: 465,
    smtpSecure: true,
    imapHost: "imap.zoho.com",
    imapPort: 993,
  },
  {
    id: "titan",
    label: "Titan Mail",
    hint: "Use the full email address and its password.",
    smtpHost: "smtp.titan.email",
    smtpPort: 465,
    smtpSecure: true,
    imapHost: "imap.titan.email",
    imapPort: 993,
  },
  {
    id: "hostinger",
    label: "Hostinger Email",
    hint: "Use the full email address and its password.",
    smtpHost: "smtp.hostinger.com",
    smtpPort: 465,
    smtpSecure: true,
    imapHost: "imap.hostinger.com",
    imapPort: 993,
  },
  {
    id: "yahoo",
    label: "Yahoo Mail",
    hint: "Yahoo requires an app password: Account security → Generate app password.",
    smtpHost: "smtp.mail.yahoo.com",
    smtpPort: 465,
    smtpSecure: true,
    imapHost: "imap.mail.yahoo.com",
    imapPort: 993,
  },
];

export const OTHER_PRESET_ID = "other";

export function findPreset(id: string): MailPreset | undefined {
  return MAIL_PRESETS.find((p) => p.id === id);
}

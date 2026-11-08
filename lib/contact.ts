import { createHmac } from "crypto";
import type { NextRequest } from "next/server";
import { supabaseServiceClient } from "./supabase";
import { sendMail } from "./mailer";
import { SUPER_ADMIN_EMAIL } from "./authz";

// Messages to JETZT (the contact_messages table, migration 0010): from the
// homepage contact form and from sub admins in the admin portal. Each one is
// kept for the super admin console and emailed to the super admin, with
// Reply-To set to the sender so a reply goes straight back to them.

export const SUPPORT_CATEGORIES = {
  change_request: "Request a change",
  issue: "Report a problem",
  billing: "Billing question",
  other: "Something else",
} as const;
export type SupportCategory = keyof typeof SUPPORT_CATEGORIES;

export const CATEGORY_LABELS: Record<string, string> = { ...SUPPORT_CATEGORIES, sales: "Website enquiry" };

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// One line of text: control characters (including line breaks) become spaces.
export function cleanLine(value: unknown, maxLength: number): string {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength)
    : "";
}

// A message body: keeps line breaks, drops other control characters.
export function cleanBlock(value: unknown, maxLength: number): string {
  return typeof value === "string"
    ? value
        .replace(/\r\n?/g, "\n")
        .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "")
        .replace(/\n{4,}/g, "\n\n\n")
        .trim()
        .slice(0, maxLength)
    : "";
}

// A one-way hash of the caller's IP address, enough to rate-limit the public
// form without storing the address itself.
export function hashIp(req: NextRequest): string | null {
  const ip = (req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "").split(",")[0].trim();
  if (!ip) return null;
  return createHmac("sha256", process.env.SUPABASE_SERVICE_KEY || "jetzt-contact")
    .update(ip)
    .digest("hex")
    .slice(0, 32);
}

export async function countMessages(filters: {
  since: Date;
  source?: "website" | "admin";
  ipHash?: string;
  orgId?: string;
}): Promise<number> {
  let query = supabaseServiceClient
    .from("contact_messages")
    .select("id", { count: "exact", head: true })
    .gte("created_at", filters.since.toISOString());
  if (filters.source) query = query.eq("source", filters.source);
  if (filters.ipHash) query = query.eq("ip_hash", filters.ipHash);
  if (filters.orgId) query = query.eq("org_id", filters.orgId);
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

type Notice = {
  id: string;
  source: "website" | "admin";
  senderEmail: string;
  senderName?: string | null;
  orgName?: string | null;
  company?: string | null;
  phone?: string | null;
  category: string;
  subject?: string | null;
  message: string;
};

// Emails the super admin about a new message. Never throws: the message is
// already saved and shows in the console either way.
export async function notifySuperAdmin(notice: Notice): Promise<boolean> {
  const sender = notice.senderName || notice.senderEmail;
  const label = CATEGORY_LABELS[notice.category] || "Message";
  const subject =
    notice.source === "website"
      ? `Website message from ${sender}`
      : `[${notice.orgName || "Organization"}] ${label}${notice.subject ? `: ${notice.subject}` : ""}`;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://dialer.thejetzt.com";

  const lines = [
    notice.source === "website"
      ? "New message from the contact form on dialer.thejetzt.com."
      : `New message from ${notice.orgName || "an organization"} in the admin portal.`,
    "",
    `From: ${notice.senderName ? `${notice.senderName} <${notice.senderEmail}>` : notice.senderEmail}`,
    notice.orgName ? `Organization: ${notice.orgName}` : null,
    notice.company ? `Company: ${notice.company}` : null,
    notice.phone ? `Phone: ${notice.phone}` : null,
    notice.source === "admin" ? `Type: ${label}` : null,
    notice.subject ? `Subject: ${notice.subject}` : null,
    "",
    notice.message,
    "",
    "--",
    `Reply to this email to answer ${sender} directly.`,
    `All messages: ${appUrl}/super-admin?tab=messages`,
  ].filter((line): line is string => line !== null);

  try {
    await sendMail(
      SUPER_ADMIN_EMAIL,
      subject.slice(0, 200),
      lines.join("\n"),
      { name: "JETZT Dialer", address: process.env.SMTP_USER || "" },
      { replyTo: notice.senderEmail, saveToSent: false }
    );
    await supabaseServiceClient.from("contact_messages").update({ email_notified: true }).eq("id", notice.id);
    return true;
  } catch (err) {
    console.error("contact: emailing the super admin failed", err);
    return false;
  }
}

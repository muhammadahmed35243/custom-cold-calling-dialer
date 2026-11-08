import { NextRequest, NextResponse } from "next/server";
import { lookup } from "dns/promises";
import { isIP } from "net";
import { supabaseServiceClient } from "./supabase";
import { getActor, ADMIN_ROLES, FOUNDING_ORG_ID, type Actor } from "./authz";
import { decrypt, encrypt } from "./crypto";
import { envMailbox, type MailboxConfig } from "./mailer";

// Connected mailboxes (migration 0013): one shared per organization, one per
// agent. Mail uses the agent's own first, then the organization's shared one,
// then -- JETZT only -- the original SMTP_* mailbox. Secrets are encrypted
// (lib/crypto.ts) and never leave the server.

export type MailboxRow = {
  id: string;
  org_id: string;
  agent_id: string | null;
  kind: "google_oauth" | "password";
  provider: string;
  email: string;
  display_name: string | null;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  imap_host: string;
  imap_port: number;
  username: string;
  secret_encrypted: string;
  status: "connected" | "reconnect_needed";
  last_error: string | null;
  connected_by: string;
  created_at: string;
  updated_at: string;
};

const COLUMNS =
  "id, org_id, agent_id, kind, provider, email, display_name, smtp_host, smtp_port, smtp_secure, imap_host, imap_port, username, secret_encrypted, status, last_error, connected_by, created_at, updated_at";

export class MailboxError extends Error {
  constructor(
    message: string,
    public status = 400,
    public code?: "no_mailbox" | "no_alias" | "reconnect"
  ) {
    super(message);
  }
}

export function mailboxErrorResponse(err: unknown): NextResponse {
  if (err instanceof MailboxError) {
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
  }
  return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
}

export function googleMailConfigured(): boolean {
  return !!(process.env.GOOGLE_MAIL_CLIENT_ID && process.env.GOOGLE_MAIL_CLIENT_SECRET);
}

export async function ownMailbox(agentId: string): Promise<MailboxRow | null> {
  const { data, error } = await supabaseServiceClient.from("mailboxes").select(COLUMNS).eq("agent_id", agentId).maybeSingle();
  if (error) throw new Error(`Couldn't load the mailbox: ${error.message}`);
  return (data as MailboxRow) || null;
}

export async function sharedMailbox(orgId: string): Promise<MailboxRow | null> {
  const { data, error } = await supabaseServiceClient
    .from("mailboxes")
    .select(COLUMNS)
    .eq("org_id", orgId)
    .is("agent_id", null)
    .maybeSingle();
  if (error) throw new Error(`Couldn't load the mailbox: ${error.message}`);
  return (data as MailboxRow) || null;
}

function reconnectMessage(row: MailboxRow): string {
  return row.kind === "google_oauth"
    ? `The Google connection for ${row.email} has expired (Google asks again every 7 days for now). Reconnect it in Mail → Mailbox settings.`
    : `${row.email} stopped accepting its password. Reconnect it with the current password in Mail → Mailbox settings.`;
}

async function markReconnect(row: MailboxRow, detail: string) {
  await supabaseServiceClient
    .from("mailboxes")
    .update({ status: "reconnect_needed", last_error: detail.slice(0, 300), updated_at: new Date().toISOString() })
    .eq("id", row.id);
}

// A wrong or revoked password / token, as nodemailer and ImapFlow report it.
export function isAuthFailure(err: any): boolean {
  return err?.code === "EAUTH" || err?.authenticationFailed === true || err?.responseCode === 535;
}

// After a sign-in failure on a stored mailbox: flag it for reconnecting and
// return the error to show.
export async function handleMailboxFailure(row: MailboxRow | null, err: unknown): Promise<MailboxError | unknown> {
  if (row && isAuthFailure(err)) {
    await markReconnect(row, err instanceof Error ? err.message : "Sign-in failed");
    return new MailboxError(reconnectMessage(row), 409, "reconnect");
  }
  return err;
}

// --- Google ------------------------------------------------------------------

// Ties a "Sign in with Google" attempt to the browser that started it.
export const GOOGLE_STATE_COOKIE = "jetzt_mailbox_google";

// Only paths inside the app, so the sign-in can't bounce people elsewhere.
export function safeReturnTo(value: unknown): string {
  const path = typeof value === "string" ? value : "";
  return path.startsWith("/") && !path.startsWith("//") && !path.includes("\\") ? path.slice(0, 300) : "/mail";
}

// Where Google sends people back to: this site's own address, whichever it is
// (https://dialer.thejetzt.com, or http://localhost:3000 when developing).
// Both must be listed as redirect URIs on the Google OAuth client.
export function googleRedirectUri(origin: string): string {
  return `${origin.replace(/\/+$/, "")}/api/mailboxes/google/callback`;
}

export function googleConsentUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_MAIL_CLIENT_ID || "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://mail.google.com/ openid email",
    // A refresh token every time, so reconnecting always works.
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function googleToken(params: Record<string, string>): Promise<any> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_MAIL_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_MAIL_CLIENT_SECRET || "",
      ...params,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error_description || body.error || `Google returned ${res.status}`) as Error & { googleError?: string };
    err.googleError = body.error;
    throw err;
  }
  return body;
}

// Turns the code from Google's consent screen into a refresh token and the
// Gmail address it belongs to.
export async function exchangeGoogleCode(
  code: string,
  redirectUri: string
): Promise<{ refreshToken: string; email: string }> {
  const tokens = await googleToken({ code, grant_type: "authorization_code", redirect_uri: redirectUri });
  if (!tokens.refresh_token) throw new Error("Google didn't return a long-lived token. Try connecting again.");
  const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const info = await res.json().catch(() => ({}));
  if (!res.ok || !info.email) throw new Error("Couldn't read which Google account was connected.");
  return { refreshToken: tokens.refresh_token, email: String(info.email).toLowerCase() };
}

async function googleAccessToken(row: MailboxRow): Promise<string> {
  try {
    const tokens = await googleToken({ refresh_token: decrypt(row.secret_encrypted), grant_type: "refresh_token" });
    return tokens.access_token;
  } catch (err: any) {
    if (err?.googleError === "invalid_grant") {
      await markReconnect(row, "Google connection expired or was removed");
      throw new MailboxError(reconnectMessage(row), 409, "reconnect");
    }
    throw new MailboxError(`Google sign-in failed: ${err instanceof Error ? err.message : String(err)}`, 502);
  }
}

// Best effort: tells Google to drop the app's access when a mailbox is disconnected.
export async function revokeGoogle(row: MailboxRow): Promise<void> {
  try {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(decrypt(row.secret_encrypted))}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
  } catch {
    // The stored token is deleted either way.
  }
}

// --- Using a stored mailbox -------------------------------------------------

export async function configFor(row: MailboxRow): Promise<MailboxConfig> {
  if (row.status === "reconnect_needed") throw new MailboxError(reconnectMessage(row), 409, "reconnect");
  const auth =
    row.kind === "google_oauth"
      ? { user: row.username, accessToken: await googleAccessToken(row) }
      : { user: row.username, pass: decrypt(row.secret_encrypted) };
  return {
    email: row.email,
    displayName: row.display_name,
    smtp: { host: row.smtp_host, port: row.smtp_port, secure: row.smtp_secure },
    imap: { host: row.imap_host, port: row.imap_port },
    auth,
    // Gmail files sent mail into Sent by itself.
    savesSentItself: row.kind === "google_oauth" || row.provider === "google",
  };
}

export type MailContext = {
  actor: Actor;
  mailbox: MailboxConfig;
  row: MailboxRow | null;
  source: "own" | "shared" | "jetzt";
  // Agents on a shared mailbox only see mail to or from their alias...
  filterAddress: string | null;
  // ...and send as it.
  sendAs?: { name: string; address: string };
};

// Which mailbox this request's user works in, ready to use.
export async function getMailContext(req: NextRequest): Promise<{ context: MailContext; error?: undefined } | { context?: undefined; error: NextResponse }> {
  const { actor, error } = await getActor(req);
  if (error) return { error };

  try {
    const own = await ownMailbox(actor.agentId);
    if (own) {
      return {
        context: { actor, mailbox: await configFor(own), row: own, source: "own", filterAddress: null },
      };
    }

    const shared = await sharedMailbox(actor.orgId);
    const legacy = !shared && actor.orgId === FOUNDING_ORG_ID ? envMailbox() : null;
    if (!shared && !legacy) {
      throw new MailboxError(
        "No mailbox is connected yet. Connect your own below, or ask your admin to connect your organization's.",
        409,
        "no_mailbox"
      );
    }

    const { data: agent } = await supabaseServiceClient
      .from("agents")
      .select("alias_email, display_name")
      .eq("id", actor.agentId)
      .single();
    const isAdmin = ADMIN_ROLES.includes(actor.role);
    if (!isAdmin && !agent?.alias_email) {
      throw new MailboxError(
        "You don't have an alias on your organization's shared mailbox. Connect your own mailbox below, or ask your admin for an alias.",
        409,
        "no_alias"
      );
    }

    return {
      context: {
        actor,
        mailbox: shared ? await configFor(shared) : legacy!,
        row: shared,
        source: shared ? "shared" : "jetzt",
        filterAddress: isAdmin ? null : agent!.alias_email,
        sendAs: agent?.alias_email
          ? { name: agent.display_name || actor.email, address: agent.alias_email }
          : undefined,
      },
    };
  } catch (err) {
    return { error: mailboxErrorResponse(err) };
  }
}

// --- Managing mailboxes -----------------------------------------------------

export type MailboxSummary = {
  id: string;
  scope: "own" | "shared";
  kind: MailboxRow["kind"];
  provider: string;
  email: string;
  displayName: string | null;
  status: MailboxRow["status"];
  lastError: string | null;
  connectedBy: string;
  updatedAt: string;
};

export function summarize(row: MailboxRow): MailboxSummary {
  return {
    id: row.id,
    scope: row.agent_id ? "own" : "shared",
    kind: row.kind,
    provider: row.provider,
    email: row.email,
    displayName: row.display_name,
    status: row.status,
    lastError: row.last_error,
    connectedBy: row.connected_by,
    updatedAt: row.updated_at,
  };
}

export function canManageShared(actor: Actor, orgId: string): boolean {
  return actor.role === "super_admin" || (ADMIN_ROLES.includes(actor.role) && orgId === actor.orgId);
}

function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateAddress(v6.slice(7));
  return v6 === "::" || v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80");
}

// Mail servers typed in by hand must be real public servers, so the app can't
// be pointed at addresses inside its own network.
export async function assertPublicMailHost(host: string): Promise<void> {
  if (!/^[a-z0-9.-]{3,253}$/i.test(host) || !host.includes(".") || isIP(host)) {
    throw new MailboxError(`"${host}" doesn't look like a mail server name`);
  }
  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new MailboxError(`Couldn't find the server ${host}. Check the name.`);
  }
  if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address))) {
    throw new MailboxError(`${host} isn't a server the app can connect to.`);
  }
}

export type MailboxInput = {
  orgId: string;
  agentId: string | null;
  kind: MailboxRow["kind"];
  provider: string;
  email: string;
  displayName: string | null;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  imapHost: string;
  imapPort: number;
  username: string;
  secret: string;
  connectedBy: string;
};

// Saves (or replaces) the organization's shared mailbox or an agent's own.
export async function saveMailbox(input: MailboxInput): Promise<MailboxRow> {
  const fields = {
    org_id: input.orgId,
    agent_id: input.agentId,
    kind: input.kind,
    provider: input.provider,
    email: input.email,
    display_name: input.displayName,
    smtp_host: input.smtpHost,
    smtp_port: input.smtpPort,
    smtp_secure: input.smtpSecure,
    imap_host: input.imapHost,
    imap_port: input.imapPort,
    username: input.username,
    secret_encrypted: encrypt(input.secret),
    status: "connected",
    last_error: null,
    connected_by: input.connectedBy,
    updated_at: new Date().toISOString(),
  };

  const existing = input.agentId ? await ownMailbox(input.agentId) : await sharedMailbox(input.orgId);
  const query = existing
    ? supabaseServiceClient.from("mailboxes").update(fields).eq("id", existing.id)
    : supabaseServiceClient.from("mailboxes").insert([fields]);
  const { data, error } = await query.select(COLUMNS).single();
  if (error || !data) throw new Error(`Couldn't save the mailbox: ${error?.message}`);
  return data as MailboxRow;
}

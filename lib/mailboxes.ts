import { NextRequest, NextResponse } from "next/server";
import { lookup } from "dns/promises";
import { isIP } from "net";
import { supabaseServiceClient } from "./supabase";
import { getActor, ADMIN_ROLES, FOUNDING_ORG_ID, type Actor } from "./authz";
import { decrypt, encrypt } from "./crypto";
import { envMailbox, type MailboxConfig } from "./mailer";

// Connected mailboxes (migration 0013): one shared per organization, one per
// agent. Mail uses the agent's own first, then the organization's shared one
// (as far as an admin lets them -- migration 0014), then -- JETZT only -- the
// original SMTP_* mailbox. Secrets are encrypted (lib/crypto.ts) and never
// leave the server.

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
    public code?: "no_mailbox" | "no_alias" | "no_access" | "reconnect"
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
  // Agents can't reconnect the organization's mailbox themselves.
  const where = row.agent_id ? "in Mail → Mailbox settings" : "(an admin does this in Admin → Mailbox)";
  return row.kind === "google_oauth"
    ? `The Google connection for ${row.email} has expired (Google asks again every 7 days for now). Reconnect it ${where}.`
    : `${row.email} stopped accepting its password. Reconnect it with the current password ${where}.`;
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

// --- Who can use the shared mailbox (migration 0014) --------------------------

// "full": the whole mailbox, sending from its address. "alias": only mail to
// or from the agent's alias, sending as the alias. "none": nothing.
export type SharedAccess = "full" | "alias" | "none";
export const SHARED_ACCESS: readonly SharedAccess[] = ["full", "alias", "none"];

function domainOf(address: string): string {
  return address.slice(address.lastIndexOf("@") + 1).toLowerCase();
}

// Until an admin chooses: agents whose alias is on the mailbox's own domain
// see their alias's mail; nobody else gets in. A Gmail address has no
// aliases, so connecting one shares nothing until the admin picks who can use it.
export function defaultSharedAccess(alias: string | null, mailboxEmail: string): SharedAccess {
  return alias && domainOf(alias) === domainOf(mailboxEmail) ? "alias" : "none";
}

// What an agent can use, given their current alias. An "alias" choice is
// worth nothing once the agent's alias is removed.
function effectiveAccess(saved: SharedAccess | undefined, alias: string | null, mailboxEmail: string): SharedAccess {
  if (saved === "alias" && !alias) return "none";
  return saved || defaultSharedAccess(alias, mailboxEmail);
}

async function sharedAccessFor(shared: MailboxRow, agentId: string, alias: string | null): Promise<SharedAccess> {
  const { data, error } = await supabaseServiceClient
    .from("mailbox_access")
    .select("access")
    .eq("mailbox_id", shared.id)
    .eq("agent_id", agentId)
    .maybeSingle();
  if (error) throw new Error(`Couldn't load mailbox access: ${error.message}`);
  return effectiveAccess(data?.access as SharedAccess | undefined, alias, shared.email);
}

export type SharedAccessEntry = {
  agentId: string;
  name: string | null;
  email: string;
  alias: string | null;
  access: SharedAccess;
  // True while no admin has chosen for this agent.
  isDefault: boolean;
};

// Every active agent in the mailbox's organization and what they can use, for
// the admin's "Who can use it" list. (Admins always see the whole mailbox.)
export async function listSharedAccess(shared: MailboxRow): Promise<SharedAccessEntry[]> {
  const [agents, saved] = await Promise.all([
    supabaseServiceClient
      .from("agents")
      .select("id, email, display_name, alias_email")
      .eq("org_id", shared.org_id)
      .eq("role", "agent")
      .eq("is_active", true)
      .order("display_name", { ascending: true }),
    supabaseServiceClient.from("mailbox_access").select("agent_id, access").eq("mailbox_id", shared.id),
  ]);
  if (agents.error) throw new Error(`Couldn't load agents: ${agents.error.message}`);
  if (saved.error) throw new Error(`Couldn't load mailbox access: ${saved.error.message}`);

  const chosen = new Map((saved.data || []).map((r) => [r.agent_id as string, r.access as SharedAccess]));
  return (agents.data || []).map((a) => {
    const alias: string | null = a.alias_email || null;
    return {
      agentId: a.id,
      name: a.display_name || null,
      email: a.email,
      alias,
      access: effectiveAccess(chosen.get(a.id), alias, shared.email),
      isDefault: !chosen.has(a.id),
    };
  });
}

// --- Picking the mailbox for a request ----------------------------------------

export type MailContext = {
  actor: Actor;
  mailbox: MailboxConfig;
  row: MailboxRow | null;
  source: "own" | "shared" | "jetzt";
  // Agents limited to their alias only see mail to or from it...
  filterAddress: string | null;
  // ...and send as it. Unset: the mailbox's own name and address.
  sendAs?: { name: string; address: string };
};

// Which mailbox this request's user works in, ready to use: their own; else
// the organization's shared one, as far as an admin lets them; else (JETZT
// only) JETZT's original mailbox, through their alias.
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

    const isAdmin = ADMIN_ROLES.includes(actor.role);
    const [shared, { data: agent }] = await Promise.all([
      sharedMailbox(actor.orgId),
      supabaseServiceClient.from("agents").select("alias_email, display_name").eq("id", actor.agentId).single(),
    ]);
    const alias: string | null = agent?.alias_email || null;
    const name: string = agent?.display_name || actor.email;

    if (shared) {
      const access = isAdmin ? "full" : await sharedAccessFor(shared, actor.agentId, alias);
      if (access === "full") {
        return {
          context: {
            actor,
            mailbox: await configFor(shared),
            row: shared,
            source: "shared",
            filterAddress: null,
            // Their alias when it's on this mailbox; otherwise the mailbox's
            // own name and address (a Gmail can't send as someone else).
            sendAs: alias && domainOf(alias) === domainOf(shared.email) ? { name, address: alias } : undefined,
          },
        };
      }
      if (access === "alias" && alias) {
        return {
          context: {
            actor,
            mailbox: await configFor(shared),
            row: shared,
            source: "shared",
            filterAddress: alias,
            sendAs: { name, address: alias },
          },
        };
      }
    }

    // JETZT's original mailbox: JETZT's mail until it connects a shared one,
    // and afterwards for JETZT agents who weren't given access to that.
    const legacy = actor.orgId === FOUNDING_ORG_ID ? envMailbox() : null;
    if (legacy && (isAdmin || alias)) {
      return {
        context: {
          actor,
          mailbox: legacy,
          row: null,
          source: "jetzt",
          filterAddress: isAdmin ? null : alias,
          sendAs: alias ? { name, address: alias } : undefined,
        },
      };
    }

    if (shared) {
      throw new MailboxError(
        "You haven't been given access to your organization's mailbox. Ask your admin for access, or connect your own mailbox below.",
        403,
        "no_access"
      );
    }
    if (legacy) {
      throw new MailboxError(
        "You don't have an alias on your organization's shared mailbox. Connect your own mailbox below, or ask your admin for an alias.",
        409,
        "no_alias"
      );
    }
    throw new MailboxError(
      "No mailbox is connected yet. Connect your own below, or ask your admin to connect your organization's.",
      409,
      "no_mailbox"
    );
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

  // A different address on the shared mailbox starts over from the defaults:
  // whoever could use the old mailbox doesn't automatically get the new one.
  if (existing && !existing.agent_id && existing.email.toLowerCase() !== input.email.toLowerCase()) {
    const { error: clearError } = await supabaseServiceClient.from("mailbox_access").delete().eq("mailbox_id", existing.id);
    if (clearError) throw new Error(`Couldn't save the mailbox: ${clearError.message}`);
  }

  const query = existing
    ? supabaseServiceClient.from("mailboxes").update(fields).eq("id", existing.id)
    : supabaseServiceClient.from("mailboxes").insert([fields]);
  const { data, error } = await query.select(COLUMNS).single();
  if (error || !data) throw new Error(`Couldn't save the mailbox: ${error?.message}`);
  return data as MailboxRow;
}

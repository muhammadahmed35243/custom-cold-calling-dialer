import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import { getActor, targetOrgId, loadOrganization, FOUNDING_ORG_ID } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { encryptionReady } from "@/lib/crypto";
import { envMailbox, testMailbox, type MailboxConfig } from "@/lib/mailer";
import { findPreset, OTHER_PRESET_ID } from "@/lib/mail-presets";
import { cleanLine } from "@/lib/contact";
import {
  assertPublicMailHost,
  canManageShared,
  googleMailConfigured,
  isAuthFailure,
  listSharedAccess,
  MailboxError,
  mailboxErrorResponse,
  ownMailbox,
  saveMailbox,
  sharedMailbox,
  summarize,
} from "@/lib/mailboxes";

// Testing a connection can take a while on slow mail servers.
export const maxDuration = 60;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SMTP_PORTS = [465, 587, 25, 2525];
const IMAP_PORTS = [993, 143];

// The caller's own mailbox and their organization's shared one (for the super
// admin, ?orgId= picks the organization), plus what can be connected and, for
// admins, which agents can use the shared one.
export async function GET(req: NextRequest) {
  const { actor, error: authError } = await getActor(req);
  if (authError) return authError;

  const orgId = targetOrgId(req, actor);
  try {
    const [own, shared] = await Promise.all([
      orgId === actor.orgId ? ownMailbox(actor.agentId) : Promise.resolve(null),
      sharedMailbox(orgId),
    ]);
    const manage = canManageShared(actor, orgId);
    const jetztMailbox = orgId === FOUNDING_ORG_ID && !!envMailbox();
    return NextResponse.json({
      own: own ? summarize(own) : null,
      shared: shared ? summarize(shared) : null,
      // JETZT's original mailbox stands in while JETZT has no shared one...
      jetztFallback: jetztMailbox && !shared,
      // ...and afterwards for JETZT agents without access to the shared one.
      jetztMailbox,
      canManageShared: manage,
      sharedAccess: shared && manage ? await listSharedAccess(shared) : null,
      googleAvailable: googleMailConfigured(),
      ready: encryptionReady(),
    });
  } catch (err) {
    return mailboxErrorResponse(err);
  }
}

// Connects a mailbox with a password or app password:
// { scope: "own" | "shared", provider, email, password, displayName?, username?,
//   and for provider "other": smtpHost, smtpPort, smtpSecure, imapHost, imapPort }.
// The details are tested (SMTP and IMAP sign-in) before anything is saved.
export async function POST(req: NextRequest) {
  const { actor, error: authError } = await getActor(req);
  if (authError) return authError;

  if (!encryptionReady()) {
    return NextResponse.json(
      { error: "Mailbox connections aren't switched on yet. JETZT needs to add the mailbox encryption key." },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const scope = body.scope === "shared" ? "shared" : "own";
  const orgId = scope === "shared" ? targetOrgId(req, actor) : actor.orgId;
  if (scope === "shared" && !canManageShared(actor, orgId)) {
    return NextResponse.json({ error: "Only an admin can connect the organization's mailbox" }, { status: 403 });
  }

  const email = cleanLine(body.email, 200).toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";
  const username = cleanLine(body.username, 200) || email;
  const provider = String(body.provider || "");
  if (!EMAIL.test(email)) return NextResponse.json({ error: "Enter the mailbox's email address" }, { status: 400 });
  if (!password || password.length > 500) {
    return NextResponse.json({ error: "Enter the mailbox password or app password" }, { status: 400 });
  }

  let smtp: MailboxConfig["smtp"];
  let imap: MailboxConfig["imap"];
  const preset = findPreset(provider);
  try {
    if (preset) {
      smtp = { host: preset.smtpHost, port: preset.smtpPort, secure: preset.smtpSecure };
      imap = { host: preset.imapHost, port: preset.imapPort };
    } else if (provider === OTHER_PRESET_ID) {
      const smtpPort = Number(body.smtpPort);
      const imapPort = Number(body.imapPort);
      if (!SMTP_PORTS.includes(smtpPort)) throw new MailboxError(`SMTP port must be one of ${SMTP_PORTS.join(", ")}`);
      if (!IMAP_PORTS.includes(imapPort)) throw new MailboxError(`IMAP port must be ${IMAP_PORTS.join(" or ")}`);
      const smtpHost = cleanLine(body.smtpHost, 253).toLowerCase();
      const imapHost = cleanLine(body.imapHost, 253).toLowerCase();
      await assertPublicMailHost(smtpHost);
      await assertPublicMailHost(imapHost);
      smtp = { host: smtpHost, port: smtpPort, secure: smtpPort === 465 };
      imap = { host: imapHost, port: imapPort };
    } else {
      throw new MailboxError("Choose your email provider");
    }
  } catch (err) {
    return mailboxErrorResponse(err);
  }

  // The name people see on sent mail: the agent's for their own mailbox, the
  // organization's for a shared one, unless one was typed in.
  let displayName = cleanLine(body.displayName, 100) || null;
  if (!displayName) {
    if (scope === "own") {
      const { data: me } = await supabaseServiceClient.from("agents").select("display_name").eq("id", actor.agentId).single();
      displayName = me?.display_name || null;
    } else {
      displayName = (orgId === actor.orgId ? actor.org : await loadOrganization(orgId))?.name || null;
    }
  }

  const config: MailboxConfig = {
    email,
    displayName,
    smtp,
    imap,
    auth: { user: username, pass: password },
    savesSentItself: provider === "google",
  };

  try {
    await testMailbox(config);
  } catch (err) {
    const message = isAuthFailure(err)
      ? "The mail server rejected that email and password. For Gmail and Yahoo, use an app password, not your normal password."
      : `Couldn't connect to the mail server: ${err instanceof Error ? err.message : String(err)}`;
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const row = await saveMailbox({
      orgId,
      agentId: scope === "own" ? actor.agentId : null,
      kind: "password",
      provider,
      email,
      displayName,
      smtpHost: smtp.host,
      smtpPort: smtp.port,
      smtpSecure: smtp.secure,
      imapHost: imap.host,
      imapPort: imap.port,
      username,
      secret: password,
      connectedBy: actor.email,
    });
    await logAudit(actor, orgId, scope === "shared" ? "mailbox.shared_connected" : "mailbox.own_connected", {
      email,
      provider,
    });
    return NextResponse.json({ mailbox: summarize(row) });
  } catch (err) {
    return mailboxErrorResponse(err);
  }
}

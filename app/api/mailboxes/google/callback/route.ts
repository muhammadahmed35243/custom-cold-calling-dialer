import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import { ADMIN_ROLES, type Actor, type Organization, type Role } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { decrypt } from "@/lib/crypto";
import {
  exchangeGoogleCode,
  GOOGLE_STATE_COOKIE,
  googleRedirectUri,
  safeReturnTo,
  saveMailbox,
} from "@/lib/mailboxes";

type State = { n: string; a: string; o: string; s: "own" | "shared"; r: string; e: number };

// Where Google sends the browser back after the consent screen. Checks the
// state (encrypted, unexpired, same browser), that the person who started is
// still allowed, then stores the Google refresh token encrypted.
export async function GET(req: NextRequest) {
  let returnTo = "/mail";

  const finish = (outcome: { connected?: string; error?: string }) => {
    const url = new URL(returnTo, req.nextUrl.origin);
    if (outcome.connected) url.searchParams.set("mailbox", "connected");
    if (outcome.error) url.searchParams.set("mailbox_error", outcome.error);
    const res = NextResponse.redirect(url);
    res.cookies.set(GOOGLE_STATE_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/api/mailboxes/google", maxAge: 0 });
    return res;
  };

  let state: State;
  try {
    state = JSON.parse(decrypt(req.nextUrl.searchParams.get("state") || ""));
    returnTo = safeReturnTo(state.r);
  } catch {
    return finish({ error: "That Google sign-in link isn't valid. Please try again." });
  }

  if (req.nextUrl.searchParams.get("error")) {
    return finish({ error: "Google sign-in was cancelled." });
  }
  if (Date.now() > state.e || req.cookies.get(GOOGLE_STATE_COOKIE)?.value !== state.n) {
    return finish({ error: "That Google sign-in expired or was opened in another browser. Please try again." });
  }

  const { data: agent } = await supabaseServiceClient
    .from("agents")
    .select("id, email, display_name, role, is_active, org_id, organizations(*)")
    .eq("id", state.a)
    .maybeSingle();
  const org = (Array.isArray(agent?.organizations) ? agent?.organizations[0] : agent?.organizations) as Organization | null;
  const role = agent?.role as Role | undefined;
  if (!agent || !agent.is_active || !org || (org.status === "suspended" && role !== "super_admin")) {
    return finish({ error: "Your account can't connect a mailbox right now." });
  }

  const orgId = state.s === "own" ? agent.org_id : state.o;
  if (state.s === "shared" && !(role === "super_admin" || (ADMIN_ROLES.includes(role!) && agent.org_id === orgId))) {
    return finish({ error: "Only an admin can connect the organization's mailbox." });
  }

  let google: { refreshToken: string; email: string };
  try {
    google = await exchangeGoogleCode(
      req.nextUrl.searchParams.get("code") || "",
      googleRedirectUri(req.nextUrl.origin)
    );
  } catch (err) {
    return finish({ error: `Google sign-in failed: ${err instanceof Error ? err.message : String(err)}` });
  }

  let displayName: string | null = agent.display_name || null;
  if (state.s === "shared") {
    const { data: target } = await supabaseServiceClient.from("organizations").select("name").eq("id", orgId).maybeSingle();
    displayName = target?.name || null;
  }

  try {
    await saveMailbox({
      orgId,
      agentId: state.s === "own" ? agent.id : null,
      kind: "google_oauth",
      provider: "google",
      email: google.email,
      displayName,
      smtpHost: "smtp.gmail.com",
      smtpPort: 465,
      smtpSecure: true,
      imapHost: "imap.gmail.com",
      imapPort: 993,
      username: google.email,
      secret: google.refreshToken,
      connectedBy: agent.email,
    });
  } catch (err) {
    return finish({ error: err instanceof Error ? err.message : "Couldn't save the mailbox" });
  }

  const actor = { email: agent.email, agentId: agent.id, role: role!, orgId: agent.org_id, org } as Actor;
  await logAudit(actor, orgId, state.s === "shared" ? "mailbox.shared_connected" : "mailbox.own_connected", {
    email: google.email,
    provider: "google",
  });

  return finish({ connected: google.email });
}

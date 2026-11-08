import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getActor, targetOrgId } from "@/lib/authz";
import { encrypt, encryptionReady } from "@/lib/crypto";
import {
  canManageShared,
  GOOGLE_STATE_COOKIE,
  googleConsentUrl,
  googleMailConfigured,
  googleRedirectUri,
  safeReturnTo,
} from "@/lib/mailboxes";

// Starts "Sign in with Google" for a mailbox: { scope: "own" | "shared",
// returnTo } (?orgId= for the super admin). Returns Google's consent URL. The
// state sent through Google is encrypted, expires in 10 minutes and is tied
// to this browser by a cookie, so a sign-in link can't be used to attach
// someone's Gmail to another person's account.
export async function POST(req: NextRequest) {
  const { actor, error: authError } = await getActor(req);
  if (authError) return authError;

  if (!googleMailConfigured()) {
    return NextResponse.json({ error: "Sign in with Google isn't set up yet. Use an app password for now." }, { status: 503 });
  }
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

  const nonce = randomBytes(16).toString("base64url");
  const state = encrypt(
    JSON.stringify({
      n: nonce,
      a: actor.agentId,
      o: orgId,
      s: scope,
      r: safeReturnTo(body.returnTo),
      e: Date.now() + 10 * 60 * 1000,
    })
  );

  const res = NextResponse.json({ url: googleConsentUrl(state, googleRedirectUri(req.nextUrl.origin)) });
  res.cookies.set(GOOGLE_STATE_COOKIE, nonce, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/api/mailboxes/google",
    maxAge: 600,
  });
  return res;
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { authedFetch } from "@/lib/voice-agent/authedFetch";
import { MAIL_PRESETS, OTHER_PRESET_ID, findPreset } from "@/lib/mail-presets";

type MailboxSummary = {
  id: string;
  scope: "own" | "shared";
  kind: "google_oauth" | "password";
  provider: string;
  email: string;
  displayName: string | null;
  status: "connected" | "reconnect_needed";
  lastError: string | null;
  connectedBy: string;
  updatedAt: string;
};

type SharedAccess = "full" | "alias" | "none";

type AccessEntry = {
  agentId: string;
  name: string | null;
  email: string;
  alias: string | null;
  access: SharedAccess;
  isDefault: boolean;
};

type MailboxInfo = {
  own: MailboxSummary | null;
  shared: MailboxSummary | null;
  jetztFallback: boolean;
  jetztMailbox: boolean;
  canManageShared: boolean;
  sharedAccess: AccessEntry[] | null;
  googleAvailable: boolean;
  ready: boolean;
};

const inputClass =
  "field";

function providerLabel(m: MailboxSummary) {
  if (m.kind === "google_oauth") return "Google (signed in with Google)";
  if (m.provider === OTHER_PRESET_ID) return "Custom mail server";
  return findPreset(m.provider)?.label || m.provider;
}

// One mailbox: an agent's own ("own") or the organization's shared one
// ("shared"; orgQuery "?orgId=..." when the super admin manages another
// organization). Shows what's connected and how it's doing, and connects it
// with Google sign-in or a password / app password.
export function MailboxSettings({
  scope,
  orgQuery = "",
  returnTo,
  onChange,
}: {
  scope: "own" | "shared";
  orgQuery?: string;
  returnTo: string;
  onChange?: () => void;
}) {
  const [info, setInfo] = useState<MailboxInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [provider, setProvider] = useState("privateemail");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("465");
  const [imapHost, setImapHost] = useState("");
  const [imapPort, setImapPort] = useState("993");
  const [busy, setBusy] = useState<"" | "connect" | "google" | "disconnect">("");
  const [error, setError] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [savingAccess, setSavingAccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await authedFetch(`/api/mailboxes${orgQuery}`);
      const body = await res.json().catch(() => ({}));
      if (res.ok) setInfo(body);
      else setLoadError(body.error || "Couldn't load the mailbox");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Couldn't load the mailbox");
    }
  }, [orgQuery]);

  useEffect(() => {
    load();
  }, [load]);

  if (loadError) {
    return <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">{loadError}</div>;
  }
  if (!info) return <div className="text-sm text-muted-foreground">Loading mailbox...</div>;

  const mailbox = scope === "own" ? info.own : info.shared;
  const canManage = scope === "own" || info.canManageShared;
  const preset = findPreset(provider);
  const formOpen = canManage && info.ready && (showForm || !mailbox);

  const startGoogle = async () => {
    setBusy("google");
    setError(null);
    try {
      const res = await authedFetch(`/api/mailboxes/google/start${orgQuery}`, {
        method: "POST",
        body: JSON.stringify({ scope, returnTo }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.url) {
        setError(body.error || "Couldn't start Google sign-in");
        setBusy("");
        return;
      }
      window.location.href = body.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start Google sign-in");
      setBusy("");
    }
  };

  const connect = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("connect");
    setError(null);
    try {
      const res = await authedFetch(`/api/mailboxes${orgQuery}`, {
        method: "POST",
        body: JSON.stringify({
          scope,
          provider,
          email,
          password,
          displayName,
          username,
          ...(provider === OTHER_PRESET_ID
            ? { smtpHost, smtpPort: Number(smtpPort), imapHost, imapPort: Number(imapPort) }
            : {}),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || "Couldn't connect the mailbox");
        return;
      }
      setPassword("");
      setShowForm(false);
      await load();
      onChange?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't connect the mailbox");
    } finally {
      setBusy("");
    }
  };

  const disconnect = async () => {
    if (!mailbox) return;
    setBusy("disconnect");
    setError(null);
    try {
      const res = await authedFetch(`/api/mailboxes/${mailbox.id}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || "Couldn't disconnect the mailbox");
        return;
      }
      setConfirmDisconnect(false);
      await load();
      onChange?.();
    } finally {
      setBusy("");
    }
  };

  const reconnect = () => {
    if (!mailbox) return;
    if (mailbox.kind === "google_oauth") {
      startGoogle();
      return;
    }
    setProvider(mailbox.provider);
    setEmail(mailbox.email);
    setShowForm(true);
  };

  // What one agent can use of the shared mailbox; saved as soon as it changes.
  const setAccess = async (entry: AccessEntry, access: SharedAccess) => {
    if (!mailbox) return;
    setSavingAccess(entry.agentId);
    setError(null);
    try {
      const res = await authedFetch(`/api/mailboxes/${mailbox.id}/access`, {
        method: "PATCH",
        body: JSON.stringify({ agentId: entry.agentId, access }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || "Couldn't change what that agent can use");
        return;
      }
      setInfo((prev) =>
        prev?.sharedAccess
          ? {
              ...prev,
              sharedAccess: prev.sharedAccess.map((a) =>
                a.agentId === entry.agentId ? { ...a, access, isDefault: false } : a
              ),
            }
          : prev
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't change what that agent can use");
    } finally {
      setSavingAccess(null);
    }
  };

  return (
    <section className="card p-6 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">
          {scope === "own" ? "Your mailbox" : "Organization mailbox"}
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          {scope === "own"
            ? "Connect your own email to read it here and send call follow-ups from it. Only you can see it."
            : "Shared by your team for call follow-ups and Mail. Admins see all of it; once it's connected, you choose below what each agent can use. An agent who connects their own mailbox uses that instead."}
        </p>
      </div>

      {!info.ready && (
        <div className="p-3 rounded-lg border border-brand/30 bg-brand/10 text-sm text-foreground">
          Mailbox connections aren&apos;t switched on yet. JETZT needs to add the mailbox encryption key.
        </div>
      )}

      {mailbox ? (
        <div className="rounded-lg border border-border p-4 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-foreground break-all">{mailbox.email}</span>
            {mailbox.status === "connected" ? (
              <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-md bg-accent-green/15 text-accent-green-foreground">
                Connected
              </span>
            ) : (
              <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-md bg-destructive/10 text-destructive">
                Needs reconnecting
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {providerLabel(mailbox)}
            {mailbox.displayName && ` · sends as "${mailbox.displayName}"`}
            {scope === "shared" && ` · connected by ${mailbox.connectedBy}`}
          </div>
          {mailbox.status === "reconnect_needed" && (
            <p className="text-xs text-destructive">
              {mailbox.kind === "google_oauth"
                ? "Google asks you to sign in again every 7 days while the app is in testing. Reconnect to keep using it."
                : "The mail server stopped accepting the saved password. Reconnect with the current password."}
            </p>
          )}
          {canManage && (
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                onClick={reconnect}
                disabled={!!busy || !info.ready}
                className="text-xs font-medium bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground py-1.5 px-3 rounded-md transition-colors"
              >
                {busy === "google" ? "Opening Google..." : mailbox.status === "reconnect_needed" ? "Reconnect" : "Reconnect or change"}
              </button>
              {confirmDisconnect ? (
                <span className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Remove it from JETZT Dialer?</span>
                  <button onClick={disconnect} disabled={!!busy} className="font-medium text-destructive hover:underline disabled:opacity-50">
                    {busy === "disconnect" ? "Disconnecting..." : "Disconnect"}
                  </button>
                  <button onClick={() => setConfirmDisconnect(false)} className="text-muted-foreground hover:underline">
                    Cancel
                  </button>
                </span>
              ) : (
                <button onClick={() => setConfirmDisconnect(true)} className="text-xs font-medium text-destructive hover:underline">
                  Disconnect
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {scope === "shared" && info.jetztFallback
            ? "Not connected. JETZT's own mailbox is used until one is."
            : canManage
              ? "Not connected yet."
              : "Not connected yet. Ask your admin to connect one."}
        </p>
      )}

      {scope === "shared" && mailbox && info.sharedAccess && (
        <div className="space-y-3 border-t border-border pt-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Who can use it</h3>
            <p className="text-xs text-muted-foreground mt-1">
              &ldquo;Whole mailbox&rdquo; shows the agent everything in {mailbox.email}, and their mail goes out from it.
              &ldquo;Only their alias&rdquo; shows just mail to or from the agent&apos;s alias.
              {info.jetztMailbox && " Agents with no access keep using JETZT's own mailbox through their alias."}
            </p>
          </div>
          {info.sharedAccess.length === 0 ? (
            <p className="text-sm text-muted-foreground">No agents yet. Add them in Manage Agents.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {info.sharedAccess.map((entry) => (
                <li key={entry.agentId} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-sm text-foreground truncate">{entry.name || entry.email}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {entry.alias ? `Alias: ${entry.alias}` : "No alias"}
                    </div>
                  </div>
                  <select
                    aria-label={`What ${entry.name || entry.email} can use`}
                    value={entry.access}
                    disabled={savingAccess === entry.agentId}
                    onChange={(e) => setAccess(entry, e.target.value as SharedAccess)}
                    className="px-2 py-1.5 border border-input rounded-md bg-card text-foreground shadow-soft text-sm focus:outline-none focus:border-brand focus:ring-4 focus:ring-brand/15 disabled:opacity-50"
                  >
                    <option value="full">Whole mailbox</option>
                    <option value="alias" disabled={!entry.alias}>
                      Only their alias
                    </option>
                    <option value="none">No access</option>
                  </select>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">{error}</div>
      )}

      {formOpen && (
        <div className="space-y-4 border-t border-border pt-4">
          {info.googleAvailable && (
            <div className="space-y-1.5">
              <button
                onClick={startGoogle}
                disabled={!!busy}
                className="inline-flex items-center gap-2 bg-background hover:bg-muted border border-border text-foreground font-medium py-2 px-4 rounded-lg text-sm transition-colors disabled:opacity-50"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                  <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7Z" />
                  <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z" />
                  <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1Z" />
                  <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9Z" />
                </svg>
                {busy === "google" ? "Opening Google..." : "Sign in with Google"}
              </button>
              <p className="text-xs text-muted-foreground">
                For Gmail and Google Workspace. Google asks you to sign in again every 7 days for now.
              </p>
            </div>
          )}

          <form onSubmit={connect} className="space-y-3">
            {info.googleAvailable && <p className="text-xs font-medium text-muted-foreground">Or connect with a password</p>}
            <div>
              <label htmlFor={`mbx-provider-${scope}`} className="block text-xs text-muted-foreground mb-1">
                Email provider
              </label>
              <select
                id={`mbx-provider-${scope}`}
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className={inputClass}
              >
                {MAIL_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
                <option value={OTHER_PRESET_ID}>Other (enter server settings)</option>
              </select>
              {preset && <p className="text-xs text-muted-foreground mt-1">{preset.hint}</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor={`mbx-email-${scope}`} className="block text-xs text-muted-foreground mb-1">
                  Email address
                </label>
                <input
                  id={`mbx-email-${scope}`}
                  type="email"
                  required
                  autoComplete="off"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor={`mbx-password-${scope}`} className="block text-xs text-muted-foreground mb-1">
                  {provider === "google" || provider === "yahoo" ? "App password" : "Password"}
                </label>
                <input
                  id={`mbx-password-${scope}`}
                  type="password"
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor={`mbx-name-${scope}`} className="block text-xs text-muted-foreground mb-1">
                  Name on sent mail (optional)
                </label>
                <input
                  id={`mbx-name-${scope}`}
                  type="text"
                  maxLength={100}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={scope === "own" ? "Your name" : "Your company"}
                  className={inputClass}
                />
              </div>
            </div>

            {provider === OTHER_PRESET_ID && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor={`mbx-smtp-${scope}`} className="block text-xs text-muted-foreground mb-1">
                    Outgoing (SMTP) server
                  </label>
                  <input id={`mbx-smtp-${scope}`} required value={smtpHost} onChange={(e) => setSmtpHost(e.target.value.trim())} placeholder="smtp.example.com" className={inputClass} />
                </div>
                <div>
                  <label htmlFor={`mbx-smtp-port-${scope}`} className="block text-xs text-muted-foreground mb-1">
                    SMTP port
                  </label>
                  <select id={`mbx-smtp-port-${scope}`} value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} className={inputClass}>
                    <option value="465">465 (SSL/TLS)</option>
                    <option value="587">587 (STARTTLS)</option>
                    <option value="2525">2525</option>
                    <option value="25">25</option>
                  </select>
                </div>
                <div>
                  <label htmlFor={`mbx-imap-${scope}`} className="block text-xs text-muted-foreground mb-1">
                    Incoming (IMAP) server
                  </label>
                  <input id={`mbx-imap-${scope}`} required value={imapHost} onChange={(e) => setImapHost(e.target.value.trim())} placeholder="imap.example.com" className={inputClass} />
                </div>
                <div>
                  <label htmlFor={`mbx-imap-port-${scope}`} className="block text-xs text-muted-foreground mb-1">
                    IMAP port
                  </label>
                  <select id={`mbx-imap-port-${scope}`} value={imapPort} onChange={(e) => setImapPort(e.target.value)} className={inputClass}>
                    <option value="993">993 (SSL/TLS)</option>
                    <option value="143">143 (STARTTLS)</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor={`mbx-user-${scope}`} className="block text-xs text-muted-foreground mb-1">
                    Username (if it isn&apos;t the email address)
                  </label>
                  <input id={`mbx-user-${scope}`} value={username} onChange={(e) => setUsername(e.target.value)} className={inputClass} />
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={!!busy}
                className="bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground font-medium py-2 px-4 rounded-lg text-sm transition-all active:translate-y-px"
              >
                {busy === "connect" ? "Testing connection..." : "Connect"}
              </button>
              {mailbox && (
                <button type="button" onClick={() => setShowForm(false)} className="text-sm text-muted-foreground hover:text-foreground">
                  Cancel
                </button>
              )}
              <span className="text-xs text-muted-foreground">
                The details are checked before saving. The password is stored encrypted and never shown again.
              </span>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

// After "Sign in with Google" the browser comes back with ?mailbox=connected
// or ?mailbox_error=...; shows that once and tidies the address bar.
export function MailboxNotice() {
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("mailbox");
    const failed = params.get("mailbox_error");
    if (!connected && !failed) return;
    setNotice(failed ? { ok: false, text: failed } : { ok: true, text: "Your Google mailbox is connected." });
    params.delete("mailbox");
    params.delete("mailbox_error");
    const rest = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${rest ? `?${rest}` : ""}`);
  }, []);

  if (!notice) return null;
  return (
    <div
      role="status"
      className={`mb-6 p-3 rounded-lg border text-sm ${
        notice.ok ? "border-accent-green/30 bg-accent-green/10 text-foreground" : "border-destructive/20 bg-destructive/10 text-destructive"
      }`}
    >
      {notice.text}
    </div>
  );
}

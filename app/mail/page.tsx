"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseAuth, supabaseClient } from "@/lib/supabase";
import { Logo } from "@/components/Logo";

export const dynamic = "force-dynamic";

type MessageSummary = {
  uid: number;
  subject: string;
  from: string;
  to: string;
  date: string | null;
  seen: boolean;
  hasAttachments: boolean;
};

type ParsedMessage = {
  uid: number;
  subject: string;
  from: string;
  to: string;
  date: string | null;
  text: string;
  html: string | null;
  attachments: { filename: string; size: number }[];
};

const FOLDERS = ["Inbox", "Sent", "Drafts"] as const;

export default function MailPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [agentInfo, setAgentInfo] = useState<{ role: string; alias_email: string | null; display_name: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const [folder, setFolder] = useState<(typeof FOLDERS)[number]>("Inbox");
  const [messages, setMessages] = useState<MessageSummary[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [selectedMessage, setSelectedMessage] = useState<ParsedMessage | null>(null);
  const [loadingMessage, setLoadingMessage] = useState(false);

  const [composeOpen, setComposeOpen] = useState(false);
  const [composeDraft, setComposeDraft] = useState({ to: "", subject: "", body: "" });
  const [sendingCompose, setSendingCompose] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user: authUser } } = await supabaseAuth.auth.getUser();

      if (!authUser?.email) {
        router.push("/auth/login");
        return;
      }

      const { data: agent } = await supabaseClient
        .from("agents")
        .select("*")
        .eq("email", authUser.email)
        .single();

      if (!agent || !agent.is_active) {
        router.push("/auth/login?error=unauthorized");
        return;
      }

      setUser(authUser);
      setAgentInfo({ role: agent.role, alias_email: agent.alias_email, display_name: agent.display_name });
      setLoading(false);
    };

    checkAuth();
  }, [router]);

  const authedFetch = async (url: string, options: RequestInit = {}) => {
    const { data: { session } } = await supabaseAuth.auth.getSession();
    if (!session) throw new Error("Session expired, please login again");
    return fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        ...options.headers,
      },
    });
  };

  const loadMessages = async (targetFolder: (typeof FOLDERS)[number]) => {
    setLoadingMessages(true);
    setListError(null);
    try {
      const response = await authedFetch(`/api/mail?folder=${targetFolder}`);
      const result = await response.json();
      if (response.ok) {
        setMessages(result.messages || []);
      } else {
        setListError(result.error || "Failed to load messages");
        setMessages([]);
      }
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Failed to load messages");
    } finally {
      setLoadingMessages(false);
    }
  };

  useEffect(() => {
    if (!agentInfo) return;
    const hasMailbox = agentInfo.role === "admin" || !!agentInfo.alias_email;
    if (hasMailbox) loadMessages(folder);
    // loadMessages is stable enough for this purpose; including it would
    // require wrapping in useCallback for no real benefit here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentInfo, folder]);

  const openMessage = async (uid: number) => {
    setLoadingMessage(true);
    setSelectedMessage(null);
    try {
      const response = await authedFetch(`/api/mail/${uid}?folder=${folder}`);
      const result = await response.json();
      if (response.ok) {
        setSelectedMessage(result.message);
      } else {
        setListError(result.error || "Failed to load message");
      }
    } catch (err) {
      setListError(err instanceof Error ? err.message : "Failed to load message");
    } finally {
      setLoadingMessage(false);
    }
  };

  const openCompose = (prefill?: { to?: string; subject?: string }) => {
    setComposeError(null);
    setComposeDraft({ to: prefill?.to || "", subject: prefill?.subject || "", body: "" });
    setComposeOpen(true);
  };

  const closeCompose = () => {
    setComposeOpen(false);
    setComposeError(null);
  };

  const sendCompose = async () => {
    if (!composeDraft.to || !composeDraft.subject || !composeDraft.body) return;
    setSendingCompose(true);
    setComposeError(null);

    try {
      const response = await authedFetch("/api/mail/send", {
        method: "POST",
        body: JSON.stringify(composeDraft),
      });
      if (response.ok) {
        closeCompose();
        if (folder === "Sent") loadMessages("Sent");
      } else {
        const result = await response.json();
        setComposeError(result.error || "Failed to send");
      }
    } catch (err) {
      setComposeError(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setSendingCompose(false);
    }
  };

  const handleSignOut = async () => {
    await supabaseAuth.auth.signOut();
    router.push("/auth/login");
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen text-muted-foreground">Loading...</div>;
  }

  const hasMailbox = agentInfo?.role === "admin" || !!agentInfo?.alias_email;

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Logo product="Mail" />
            <button
              onClick={() => router.push(agentInfo?.role === "admin" ? "/dashboard" : "/dialer")}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Back
            </button>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">{user?.email}</span>
            <button
              onClick={handleSignOut}
              className="px-3 py-1.5 text-sm bg-destructive/10 text-destructive rounded-lg hover:bg-destructive/20 transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {!hasMailbox ? (
          <div className="bg-card border border-border rounded-xl p-8 text-center">
            <h2 className="text-sm font-semibold text-foreground mb-1.5">No mailbox alias assigned yet</h2>
            <p className="text-sm text-muted-foreground">Ask your admin to assign you a mailbox alias to use Mail.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Sidebar */}
            <div className="lg:col-span-1 space-y-4">
              <button
                onClick={() => openCompose()}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium py-2.5 px-4 rounded-lg transition-all active:translate-y-px"
              >
                Compose
              </button>
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                {FOLDERS.map((f) => (
                  <button
                    key={f}
                    onClick={() => setFolder(f)}
                    className={`w-full text-left px-4 py-3 text-sm border-b border-border last:border-b-0 transition-colors ${
                      folder === f ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
              {agentInfo?.role === "admin" && (
                <p className="text-xs text-muted-foreground px-1">Viewing all mail (admin)</p>
              )}
            </div>

            {/* Message list */}
            <div className="lg:col-span-3">
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="bg-muted px-6 py-3.5 border-b border-border">
                  <h3 className="text-sm font-semibold text-foreground">{folder}</h3>
                </div>
                <div className="divide-y divide-border">
                  {loadingMessages ? (
                    <div className="p-6 text-center text-sm text-muted-foreground">Loading...</div>
                  ) : listError ? (
                    <div className="p-6 text-center text-sm text-destructive">{listError}</div>
                  ) : messages.length === 0 ? (
                    <div className="p-6 text-center text-sm text-muted-foreground">No messages</div>
                  ) : (
                    messages.map((msg) => (
                      <button
                        key={msg.uid}
                        onClick={() => openMessage(msg.uid)}
                        className="w-full text-left px-6 py-3.5 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex justify-between items-baseline gap-4">
                          <span className={`text-sm truncate ${msg.seen ? "text-muted-foreground" : "text-foreground font-medium"}`}>
                            {folder === "Sent" ? msg.to : msg.from}
                          </span>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {msg.date ? new Date(msg.date).toLocaleString() : ""}
                          </span>
                        </div>
                        <div className={`text-sm truncate mt-0.5 ${msg.seen ? "text-muted-foreground" : "text-foreground"}`}>
                          {msg.subject}
                          {msg.hasAttachments && <span className="ml-1.5 text-muted-foreground">📎</span>}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {(loadingMessage || selectedMessage) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-4">
          <div className="bg-card border border-border rounded-xl shadow-sm p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto">
            {loadingMessage ? (
              <div className="text-center text-sm text-muted-foreground py-8">Loading...</div>
            ) : selectedMessage ? (
              <>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{selectedMessage.subject}</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      From {selectedMessage.from} to {selectedMessage.to}
                      {selectedMessage.date && ` · ${new Date(selectedMessage.date).toLocaleString()}`}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedMessage(null)}
                    className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  >
                    ✕
                  </button>
                </div>

                {selectedMessage.attachments.length > 0 && (
                  <div className="mb-4 text-xs text-muted-foreground">
                    📎 {selectedMessage.attachments.map((a) => a.filename).join(", ")}
                  </div>
                )}

                <div className="text-sm text-foreground border-t border-border pt-4">
                  {selectedMessage.html ? (
                    <div dangerouslySetInnerHTML={{ __html: selectedMessage.html }} />
                  ) : (
                    <pre className="whitespace-pre-wrap font-sans">{selectedMessage.text}</pre>
                  )}
                </div>

                <div className="mt-6 pt-4 border-t border-border">
                  <button
                    onClick={() => {
                      const replyTo = selectedMessage.from;
                      const replySubject = selectedMessage.subject.startsWith("Re:")
                        ? selectedMessage.subject
                        : `Re: ${selectedMessage.subject}`;
                      setSelectedMessage(null);
                      openCompose({ to: replyTo, subject: replySubject });
                    }}
                    className="px-4 py-2 text-sm bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-lg transition-colors"
                  >
                    Reply
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}

      {composeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-4">
          <div className="bg-card border border-border rounded-xl shadow-sm p-6 w-full max-w-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-foreground">Compose</h3>
              <button
                onClick={closeCompose}
                className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <input
                type="email"
                value={composeDraft.to}
                onChange={(e) => setComposeDraft({ ...composeDraft, to: e.target.value })}
                placeholder="To"
                className="w-full px-3.5 py-2 border border-border rounded-lg bg-background text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring"
              />
              <input
                type="text"
                value={composeDraft.subject}
                onChange={(e) => setComposeDraft({ ...composeDraft, subject: e.target.value })}
                placeholder="Subject"
                className="w-full px-3.5 py-2 border border-border rounded-lg bg-background text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring"
              />
              <textarea
                value={composeDraft.body}
                onChange={(e) => setComposeDraft({ ...composeDraft, body: e.target.value })}
                placeholder="Message"
                rows={9}
                className="w-full px-3.5 py-2 border border-border rounded-lg bg-background text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring"
              />

              {composeError && <div className="text-sm text-destructive">{composeError}</div>}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={sendCompose}
                  disabled={sendingCompose || !composeDraft.to || !composeDraft.subject || !composeDraft.body}
                  className="flex-1 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground font-medium py-2.5 px-4 rounded-lg transition-all active:translate-y-px"
                >
                  {sendingCompose ? "Sending..." : "Send"}
                </button>
                <button
                  onClick={closeCompose}
                  className="flex-1 bg-secondary hover:bg-secondary/80 text-secondary-foreground font-medium py-2.5 px-4 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

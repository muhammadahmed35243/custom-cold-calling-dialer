"use client";

import { useEffect, useState } from "react";
import { authedFetch } from "@/lib/voice-agent/authedFetch";

type SupportMessage = {
  id: string;
  created_at: string;
  category: string;
  subject: string | null;
  message: string;
  status: "new" | "in_progress" | "resolved";
  sender_email: string;
};

const CATEGORIES: { key: string; label: string; hint: string }[] = [
  {
    key: "change_request",
    label: "Request a change",
    hint: "More agents or numbers, a higher budget, turning a feature on, new countries or calling hours.",
  },
  { key: "issue", label: "Report a problem", hint: "Something isn't working: calls, recordings, emails, the dialer." },
  { key: "billing", label: "Billing question", hint: "Your usage, statement or prices." },
  { key: "other", label: "Something else", hint: "Anything else you'd like to ask JETZT." },
];

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.label]));

// How the sub admin sees JETZT's status on each message.
const STATUS: Record<SupportMessage["status"], { label: string; className: string }> = {
  new: { label: "Sent", className: "bg-secondary text-foreground" },
  in_progress: { label: "In progress", className: "bg-brand/15 text-foreground" },
  resolved: { label: "Resolved", className: "bg-accent-green/15 text-accent-green-foreground" },
};

const inputClass =
  "w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring";

// The admin portal's way to reach JETZT: change requests, problems and
// billing questions. Each message reaches the super admin's console and
// inbox; JETZT replies by email.
export function SupportTab() {
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("change_request");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentNotice, setSentNotice] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await authedFetch("/api/support");
        const body = await res.json().catch(() => ({}));
        if (res.ok) setMessages(body.messages || []);
        else setError(body.error || "Couldn't load your messages");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't load your messages");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError(null);
    setSentNotice(false);
    try {
      const res = await authedFetch("/api/support", {
        method: "POST",
        body: JSON.stringify({ category, subject, message }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || "Your message couldn't be sent");
        return;
      }
      setMessages((prev) => [body.message, ...prev]);
      setSubject("");
      setMessage("");
      setSentNotice(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Your message couldn't be sent");
    } finally {
      setSending(false);
    }
  };

  const hint = CATEGORIES.find((c) => c.key === category)?.hint;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
      <form onSubmit={send} className="lg:col-span-3 bg-card border border-border rounded-xl p-6 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Contact JETZT</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Ask for a change, report a problem or ask about billing. We reply by email.
          </p>
        </div>

        <div>
          <label htmlFor="support-category" className="block text-xs text-muted-foreground mb-1">
            What&apos;s it about?
          </label>
          <select
            id="support-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={inputClass}
          >
            {CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
          {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
        </div>

        <div>
          <label htmlFor="support-subject" className="block text-xs text-muted-foreground mb-1">
            Subject
          </label>
          <input
            id="support-subject"
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={150}
            required
            placeholder="e.g. Please raise our number limit to 3"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="support-message" className="block text-xs text-muted-foreground mb-1">
            Message
          </label>
          <textarea
            id="support-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={5000}
            required
            rows={6}
            placeholder="Tell us what you need. For a problem, say what happened and roughly when."
            className={`${inputClass} resize-y`}
          />
        </div>

        {error && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">{error}</div>
        )}
        {sentNotice && (
          <div role="status" className="p-3 bg-accent-green/10 border border-accent-green/20 rounded-lg text-sm text-foreground">
            Sent. JETZT will reply to you by email.
          </div>
        )}

        <button
          type="submit"
          disabled={sending}
          className="bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground font-medium py-2 px-4 rounded-lg text-sm transition-all active:translate-y-px"
        >
          {sending ? "Sending..." : "Send message"}
        </button>
      </form>

      <section className="lg:col-span-2 bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Your messages</h2>
          <p className="text-xs text-muted-foreground mt-1">Everyone in your organization&apos;s admin team sees these.</p>
        </div>
        {loading ? (
          <div className="p-5 text-sm text-muted-foreground">Loading...</div>
        ) : messages.length === 0 ? (
          <div className="p-5 text-sm text-muted-foreground">No messages yet.</div>
        ) : (
          <ul className="divide-y divide-border">
            {messages.map((m) => (
              <li key={m.id} className="px-5 py-4 space-y-1">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-sm font-medium text-foreground break-words">
                    {m.subject || CATEGORY_LABELS[m.category] || "Message"}
                  </span>
                  <span className={`shrink-0 text-[11px] font-medium px-1.5 py-0.5 rounded-md ${STATUS[m.status].className}`}>
                    {STATUS[m.status].label}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {CATEGORY_LABELS[m.category] || m.category} &middot; {new Date(m.created_at).toLocaleDateString()} &middot;{" "}
                  {m.sender_email}
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 whitespace-pre-wrap break-words">{m.message}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

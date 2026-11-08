"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { authedFetch } from "@/lib/voice-agent/authedFetch";

type Status = "new" | "in_progress" | "resolved";

type Message = {
  id: string;
  created_at: string;
  source: "website" | "admin";
  sender_email: string;
  sender_name: string | null;
  company: string | null;
  phone: string | null;
  category: string;
  subject: string | null;
  message: string;
  status: Status;
  email_notified: boolean;
  orgName: string | null;
};

type Filter = "open" | "new" | "resolved" | "all";

const CATEGORY_LABELS: Record<string, string> = {
  sales: "Website enquiry",
  change_request: "Request a change",
  issue: "Problem",
  billing: "Billing",
  other: "Other",
};

const STATUS_LABELS: Record<Status, string> = { new: "New", in_progress: "In progress", resolved: "Resolved" };

const STATUS_STYLES: Record<Status, string> = {
  new: "bg-brand/15 text-foreground",
  in_progress: "bg-secondary text-foreground",
  resolved: "bg-accent-green/15 text-accent-green-foreground",
};

// Long messages start folded so the list stays scannable.
const PREVIEW_CHARS = 400;

// Messages sent to JETZT from the homepage form and from sub admins. Each was
// also emailed to the super admin; replying to that email (or "Reply by
// email" here) answers the sender directly.
export function MessagesPanel({ onNewCountChange }: { onNewCountChange?: (count: number) => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("open");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await authedFetch("/api/super-admin/messages");
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setMessages(body.messages || []);
        onNewCountChange?.(body.newCount ?? 0);
        setError(null);
      } else {
        setError(body.error || "Couldn't load messages");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load messages");
    } finally {
      setLoading(false);
    }
  }, [onNewCountChange]);

  useEffect(() => {
    load();
  }, [load]);

  const setStatus = async (message: Message, status: Status) => {
    setBusyId(message.id);
    setError(null);
    try {
      const res = await authedFetch(`/api/super-admin/messages/${message.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || "Couldn't update the message");
        return;
      }
      const next = messages.map((m) => (m.id === message.id ? { ...m, status } : m));
      setMessages(next);
      onNewCountChange?.(next.filter((m) => m.status === "new").length);
    } finally {
      setBusyId(null);
    }
  };

  const counts = useMemo(
    () => ({
      open: messages.filter((m) => m.status !== "resolved").length,
      new: messages.filter((m) => m.status === "new").length,
      resolved: messages.filter((m) => m.status === "resolved").length,
      all: messages.length,
    }),
    [messages]
  );

  const shown = messages.filter((m) =>
    filter === "all" ? true : filter === "open" ? m.status !== "resolved" : m.status === filter
  );

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (loading) return <div className="text-sm text-muted-foreground">Loading messages...</div>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-foreground tracking-tight">Messages</h1>
        <p className="text-sm text-muted-foreground mt-1">
          From the contact form on the homepage and from sub admins. Each one is also emailed to you &mdash; reply to
          that email, or use Reply by email here, to answer the sender.
        </p>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Show messages">
        {(
          [
            ["open", "Open"],
            ["new", "New"],
            ["resolved", "Resolved"],
            ["all", "All"],
          ] as [Filter, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            aria-pressed={filter === key}
            className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${
              filter === key
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:text-foreground"
            }`}
          >
            {label} ({counts[key]})
          </button>
        ))}
      </div>

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">{error}</div>
      )}

      {shown.length === 0 ? (
        <div className="card p-6 text-sm text-muted-foreground">
          {messages.length === 0 ? "No messages yet." : "Nothing here."}
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map((m) => {
            const isLong = m.message.length > PREVIEW_CHARS;
            const isOpen = expanded.has(m.id);
            const replySubject = `Re: ${m.subject || (m.source === "website" ? "your message to JETZT" : "your request")}`;
            return (
              <article key={m.id} className="card p-5 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">{m.sender_name || m.sender_email}</span>
                      <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-md ${STATUS_STYLES[m.status]}`}>
                        {STATUS_LABELS[m.status]}
                      </span>
                      <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-md bg-background border border-border text-foreground">
                        {m.source === "website" ? "Website" : m.orgName || "Organization"}
                      </span>
                      <span className="text-xs text-muted-foreground">{CATEGORY_LABELS[m.category] || m.category}</span>
                    </div>
                    <div className="text-xs text-muted-foreground break-all">
                      {m.sender_email}
                      {m.company && ` · ${m.company}`}
                      {m.phone && ` · ${m.phone}`}
                    </div>
                  </div>
                  <time className="text-xs text-muted-foreground whitespace-nowrap" dateTime={m.created_at}>
                    {new Date(m.created_at).toLocaleString()}
                  </time>
                </div>

                {m.subject && <h2 className="text-sm font-medium text-foreground">{m.subject}</h2>}
                <p className="text-sm text-foreground whitespace-pre-wrap break-words">
                  {isLong && !isOpen ? `${m.message.slice(0, PREVIEW_CHARS)}…` : m.message}
                </p>
                {isLong && (
                  <button onClick={() => toggle(m.id)} className="text-xs font-medium text-muted-foreground hover:text-foreground">
                    {isOpen ? "Show less" : "Show all"}
                  </button>
                )}

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <a
                    href={`mailto:${m.sender_email}?subject=${encodeURIComponent(replySubject)}`}
                    className="text-xs font-medium bg-primary hover:bg-primary/90 text-primary-foreground py-1.5 px-3 rounded-md transition-colors"
                  >
                    Reply by email
                  </a>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    Status
                    <select
                      value={m.status}
                      disabled={busyId === m.id}
                      onChange={(e) => setStatus(m, e.target.value as Status)}
                      className="px-2 py-1 border border-input rounded-md bg-card text-foreground shadow-soft text-xs focus:outline-none focus:border-brand focus:ring-4 focus:ring-brand/15"
                    >
                      <option value="new">New</option>
                      <option value="in_progress">In progress</option>
                      <option value="resolved">Resolved</option>
                    </select>
                  </label>
                  {!m.email_notified && (
                    <span className="text-xs text-muted-foreground">The email to you didn&apos;t go through; it&apos;s only here.</span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

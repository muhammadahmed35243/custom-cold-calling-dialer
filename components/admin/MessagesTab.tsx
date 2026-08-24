"use client";

import { useEffect, useState } from "react";
import { authedFetch } from "@/lib/voice-agent/authedFetch";
import type { FallbackMessage } from "@/lib/voice-agent/types";

export function MessagesTab() {
  const [messages, setMessages] = useState<FallbackMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const res = await authedFetch("/api/voice-agent/messages");
    const body = await res.json();
    if (res.ok) setMessages(body.messages);
    else setError(body.error || "Failed to load");
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const markResponded = async (id: string) => {
    setBusyId(id);
    try {
      const res = await authedFetch(`/api/voice-agent/messages/${id}`, { method: "PATCH" });
      if (res.ok) await load();
      else setError((await res.json()).error || "Failed to update");
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <div className="text-sm text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
          {error}
        </div>
      )}

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-muted border-b border-border">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Caller</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Message</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Contact Email</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Received</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {messages.map((msg) => (
              <tr key={msg.id} className="hover:bg-muted/50 transition-colors">
                <td className="px-6 py-4 text-sm text-foreground font-mono">{msg.caller_phone || "unknown"}</td>
                <td className="px-6 py-4 text-sm text-foreground max-w-md">{msg.message}</td>
                <td className="px-6 py-4 text-sm text-muted-foreground">{msg.contact_email}</td>
                <td className="px-6 py-4 text-sm">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${
                      msg.status === "open" ? "bg-brand/15 text-brand" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {msg.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-muted-foreground">
                  {new Date(msg.created_at).toLocaleString()}
                </td>
                <td className="px-6 py-4 text-sm text-right">
                  {msg.status === "open" ? (
                    <button
                      onClick={() => markResponded(msg.id)}
                      disabled={busyId === msg.id}
                      className="px-2.5 py-1 text-xs font-medium text-accent-green-foreground hover:bg-accent-green/15 disabled:opacity-40 rounded-md transition-colors"
                    >
                      Mark Responded
                    </button>
                  ) : (
                    <span className="text-xs text-muted-foreground">-</span>
                  )}
                </td>
              </tr>
            ))}
            {messages.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-sm text-muted-foreground text-center">
                  No messages yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

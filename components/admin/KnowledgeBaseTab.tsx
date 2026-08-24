"use client";

import { useEffect, useState } from "react";
import { authedFetch } from "@/lib/voice-agent/authedFetch";
import type { KnowledgeBaseEntry } from "@/lib/voice-agent/types";

export function KnowledgeBaseTab() {
  const [entries, setEntries] = useState<KnowledgeBaseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [newContent, setNewContent] = useState("");
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const res = await authedFetch("/api/voice-agent/knowledge-base");
    const body = await res.json();
    if (res.ok) setEntries(body.entries);
    else setError(body.error || "Failed to load");
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const res = await authedFetch("/api/voice-agent/knowledge-base", {
        method: "POST",
        body: JSON.stringify({ content: newContent }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to add");
      setNewContent("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this knowledge base entry?")) return;
    setBusyId(id);
    try {
      const res = await authedFetch(`/api/voice-agent/knowledge-base/${id}`, { method: "DELETE" });
      if (res.ok) await load();
      else setError((await res.json()).error || "Failed to delete");
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
          {error}
        </div>
      )}

      <div className="bg-card border border-border rounded-xl p-6">
        <h2 className="text-sm font-semibold text-foreground mb-4">Add Knowledge Base Entry</h2>
        <form onSubmit={handleAdd} className="space-y-3">
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="A fact, FAQ answer, or policy the agent should be able to answer from..."
            rows={3}
            className="w-full px-3.5 py-2.5 border border-border rounded-lg bg-background text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring"
          />
          <button
            type="submit"
            disabled={adding}
            className="bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground font-medium py-2 px-4 rounded-lg text-sm transition-all active:translate-y-px"
          >
            {adding ? "Adding (embedding)..." : "Add"}
          </button>
        </form>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-muted border-b border-border">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Content</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Source</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Added</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {entries.map((entry) => (
              <tr key={entry.id} className="hover:bg-muted/50 transition-colors">
                <td className="px-6 py-4 text-sm text-foreground max-w-xl">{entry.content}</td>
                <td className="px-6 py-4 text-sm text-muted-foreground">{entry.source || "-"}</td>
                <td className="px-6 py-4 text-sm text-muted-foreground">
                  {new Date(entry.created_at).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 text-sm text-right">
                  <button
                    onClick={() => handleDelete(entry.id)}
                    disabled={busyId === entry.id}
                    className="px-2.5 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-40 rounded-md transition-colors"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-sm text-muted-foreground text-center">
                  No entries yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

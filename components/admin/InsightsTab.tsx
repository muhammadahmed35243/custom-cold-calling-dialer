"use client";

import { useEffect, useState } from "react";
import { authedFetch } from "@/lib/voice-agent/authedFetch";
import type { Insight } from "@/lib/voice-agent/types";

const STATUS_STYLE: Record<Insight["status"], string> = {
  pending: "bg-brand/15 text-brand",
  approved: "bg-accent-green/15 text-accent-green-foreground",
  rejected: "bg-destructive/10 text-destructive",
  auto_applied: "bg-muted text-muted-foreground",
};

export function InsightsTab() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const res = await authedFetch("/api/voice-agent/insights");
    const body = await res.json();
    if (res.ok) setInsights(body.insights);
    else setError(body.error || "Failed to load");
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const resolve = async (id: string, action: "approve" | "reject") => {
    setBusyId(id);
    try {
      const res = await authedFetch(`/api/voice-agent/insights/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ action }),
      });
      if (res.ok) await load();
      else setError((await res.json()).error || "Failed to resolve");
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <div className="text-sm text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Additive knowledge-base facts apply automatically and show here just for visibility. Instruction changes —
        anything touching how the agent behaves — wait here until approved.
      </p>

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
          {error}
        </div>
      )}

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-muted border-b border-border">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Kind</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Content</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Created</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {insights.map((insight) => (
              <tr key={insight.id} className="hover:bg-muted/50 transition-colors">
                <td className="px-6 py-4 text-sm text-muted-foreground">
                  {insight.kind === "kb_fact" ? "KB fact" : "Instruction change"}
                </td>
                <td className="px-6 py-4 text-sm text-foreground max-w-xl">{insight.content}</td>
                <td className="px-6 py-4 text-sm">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${STATUS_STYLE[insight.status]}`}>
                    {insight.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-muted-foreground">
                  {new Date(insight.created_at).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 text-sm text-right whitespace-nowrap">
                  {insight.status === "pending" ? (
                    <>
                      <button
                        onClick={() => resolve(insight.id, "approve")}
                        disabled={busyId === insight.id}
                        className="px-2.5 py-1 text-xs font-medium text-accent-green-foreground hover:bg-accent-green/15 disabled:opacity-40 rounded-md transition-colors"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => resolve(insight.id, "reject")}
                        disabled={busyId === insight.id}
                        className="ml-1 px-2.5 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 disabled:opacity-40 rounded-md transition-colors"
                      >
                        Reject
                      </button>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">-</span>
                  )}
                </td>
              </tr>
            ))}
            {insights.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-sm text-muted-foreground text-center">
                  Nothing yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

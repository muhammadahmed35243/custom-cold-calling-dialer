"use client";

import { Fragment, useEffect, useState } from "react";
import { authedFetch } from "@/lib/voice-agent/authedFetch";
import type { VoiceAgentCall } from "@/lib/voice-agent/types";

function duration(call: VoiceAgentCall): string {
  if (!call.ended_at) return "-";
  const secs = Math.round(
    (new Date(call.ended_at).getTime() - new Date(call.started_at).getTime()) / 1000
  );
  return `${secs}s`;
}

export function VoiceCallsTab() {
  const [calls, setCalls] = useState<VoiceAgentCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await authedFetch("/api/voice-agent/calls");
      const body = await res.json();
      if (res.ok) setCalls(body.calls);
      else setError(body.error || "Failed to load");
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="text-sm text-muted-foreground">Loading...</div>;
  if (error) {
    return (
      <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
        {error}
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <table className="w-full">
        <thead className="bg-muted border-b border-border">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Caller</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Duration</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Outcome</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Recording</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Started</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {calls.map((call) => (
            <Fragment key={call.id}>
              <tr
                onClick={() => setExpandedId(expandedId === call.id ? null : call.id)}
                className="hover:bg-muted/50 transition-colors cursor-pointer"
              >
                <td className="px-6 py-4 text-sm text-foreground font-mono">{call.caller_phone || "unknown"}</td>
                <td className="px-6 py-4 text-sm text-foreground">{duration(call)}</td>
                <td className="px-6 py-4 text-sm text-muted-foreground">{call.outcome || "-"}</td>
                <td className="px-6 py-4 text-sm">
                  {call.recording_url ? (
                    <a
                      href={call.recording_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-foreground underline underline-offset-2 hover:no-underline"
                    >
                      Listen
                    </a>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </td>
                <td className="px-6 py-4 text-sm text-muted-foreground">
                  {new Date(call.started_at).toLocaleString()}
                </td>
              </tr>
              {expandedId === call.id && (
                <tr>
                  <td colSpan={5} className="px-6 py-4 bg-muted/30">
                    <div className="space-y-2 max-w-3xl">
                      {call.transcript.length === 0 && (
                        <span className="text-sm text-muted-foreground">No transcript recorded.</span>
                      )}
                      {call.transcript.map((turn, i) => (
                        <div key={i} className="text-sm">
                          <span
                            className={`font-medium ${
                              turn.role === "agent" ? "text-brand" : "text-foreground"
                            }`}
                          >
                            {turn.role === "agent" ? "Agent" : "Caller"}:
                          </span>{" "}
                          <span className="text-foreground">{turn.text}</span>
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
          {calls.length === 0 && (
            <tr>
              <td colSpan={5} className="px-6 py-8 text-sm text-muted-foreground text-center">
                No calls yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

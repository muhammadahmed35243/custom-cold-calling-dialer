"use client";

import { useEffect, useState } from "react";
import { authedFetch } from "@/lib/voice-agent/authedFetch";
import type { AgentConfig } from "@/lib/voice-agent/types";

export function InstructionsTab() {
  const [coreInstructions, setCoreInstructions] = useState("");
  const [timelyInfo, setTimelyInfo] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await authedFetch("/api/voice-agent/config");
      const body = await res.json();
      if (res.ok) {
        const byKey = Object.fromEntries((body.config as AgentConfig[]).map((c) => [c.key, c.value]));
        setCoreInstructions(byKey.core_instructions || "");
        setTimelyInfo(byKey.timely_info || "");
      } else {
        setError(body.error || "Failed to load");
      }
      setLoading(false);
    })();
  }, []);

  const save = async (key: "core_instructions" | "timely_info", value: string) => {
    setSavingKey(key);
    setError(null);
    setSavedKey(null);
    try {
      const res = await authedFetch("/api/voice-agent/config", {
        method: "PATCH",
        body: JSON.stringify({ key, value }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Save failed");
      setSavedKey(key);
      setTimeout(() => setSavedKey(null), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingKey(null);
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
        <h2 className="text-sm font-semibold text-foreground mb-1">Core Instructions</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Tone, policy, how the agent should handle things. Changes rarely — always injected into every call.
        </p>
        <textarea
          value={coreInstructions}
          onChange={(e) => setCoreInstructions(e.target.value)}
          rows={8}
          className="w-full px-3.5 py-2.5 border border-border rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring font-mono"
        />
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={() => save("core_instructions", coreInstructions)}
            disabled={savingKey === "core_instructions"}
            className="bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground font-medium py-2 px-4 rounded-lg text-sm transition-all active:translate-y-px"
          >
            {savingKey === "core_instructions" ? "Saving..." : "Save"}
          </button>
          {savedKey === "core_instructions" && (
            <span className="text-xs text-accent-green-foreground">Saved — takes effect on the next call.</span>
          )}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-6">
        <h2 className="text-sm font-semibold text-foreground mb-1">Timely Info</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Today&apos;s hours, a closure, a current promo. Also always injected — kept separate from the knowledge base
          so a caller can&apos;t miss it just because they didn&apos;t ask about it directly.
        </p>
        <textarea
          value={timelyInfo}
          onChange={(e) => setTimelyInfo(e.target.value)}
          rows={5}
          className="w-full px-3.5 py-2.5 border border-border rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring font-mono"
        />
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={() => save("timely_info", timelyInfo)}
            disabled={savingKey === "timely_info"}
            className="bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground font-medium py-2 px-4 rounded-lg text-sm transition-all active:translate-y-px"
          >
            {savingKey === "timely_info" ? "Saving..." : "Save"}
          </button>
          {savedKey === "timely_info" && (
            <span className="text-xs text-accent-green-foreground">Saved — takes effect on the next call.</span>
          )}
        </div>
      </div>
    </div>
  );
}

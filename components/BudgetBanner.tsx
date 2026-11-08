"use client";

import { useEffect, useState } from "react";
import { authedFetch } from "@/lib/voice-agent/authedFetch";

export type BudgetInfo = { usedPct: number; limitUsd?: number; spentUsd?: number } | null;

const money = (n: number) => `$${n.toFixed(2)}`;

// Warns once an organization has used 80% of its monthly budget; at 100%
// new calls are paused. Pass `budget` from /api/me when the page already
// has it; leave it out and the banner loads it itself.
export function BudgetBanner({ budget: given }: { budget?: BudgetInfo }) {
  const [loaded, setLoaded] = useState<BudgetInfo>(null);

  useEffect(() => {
    if (given !== undefined) return;
    (async () => {
      try {
        const res = await authedFetch("/api/me");
        if (res.ok) setLoaded((await res.json()).budget ?? null);
      } catch {
        // No banner if it can't load; calls are still checked on the server.
      }
    })();
  }, [given]);

  const budget = given !== undefined ? given : loaded;
  if (!budget || budget.usedPct < 80) return null;

  const usedUp = budget.usedPct >= 100;
  const amounts =
    budget.limitUsd !== undefined && budget.spentUsd !== undefined
      ? ` (${money(budget.spentUsd)} of ${money(budget.limitUsd)})`
      : "";

  return (
    <div
      role="status"
      className={`mb-6 rounded-lg border px-4 py-3 text-sm ${
        usedUp
          ? "border-destructive/30 bg-destructive/10 text-destructive"
          : "border-brand/30 bg-brand/10 text-foreground"
      }`}
    >
      {usedUp
        ? `Your organization has used its monthly budget${amounts}, so new calls are paused until it's raised or the next month starts.`
        : `Your organization has used ${budget.usedPct}% of its monthly budget${amounts}. New calls pause when it's used up.`}
    </div>
  );
}

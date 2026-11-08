"use client";

import { useEffect, useState } from "react";
import { authedFetch } from "@/lib/voice-agent/authedFetch";

type UsageCall = {
  id: string;
  createdAt: string;
  agentEmail: string;
  leadName: string | null;
  leadPhone: string | null;
  mode: "phone" | "browser" | null;
  talkSeconds: number;
  agentLegSeconds: number | null;
  priceUsd: number | null;
  costUsd?: number | null;
  note?: string | null;
};

type UsageNumber = {
  phoneNumber: string;
  purchasedAt: string;
  releasedAt: string | null;
  monthlyPrice: number;
  upfrontPrice: number;
  monthlyCost?: number;
  upfrontCost?: number;
};

type Usage = {
  month: string;
  org: { id: string; name: string; budgetUsd: number | null; voicePricePerMin: number };
  spend: {
    callsPrice: number;
    numbersPrice: number;
    voicePrice: number;
    totalPrice: number;
    callsCost?: number;
    numbersCost?: number;
    totalCost?: number;
  };
  stats: { calls: number; connected: number; talkSeconds: number; numbers: number; voiceMinutes: number; truncated: boolean };
  calls: UsageCall[];
  numbers: UsageNumber[];
};

const SHOWN_CALLS = 200;

function currentMonth() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const money = (n: number | null | undefined) => (n === null || n === undefined ? "-" : `$${n.toFixed(2)}`);
// Single calls often cost fractions of a cent per minute.
const precise = (n: number | null | undefined) => (n === null || n === undefined ? "-" : `$${n.toFixed(4)}`);

function talkTime(seconds: number) {
  if (!seconds) return "-";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Quoted CSV cell. Text starting with = + - @ is prefixed with ' so a
// spreadsheet doesn't run it as a formula (lead names come from uploads).
function csvCell(value: unknown) {
  let text = value === null || value === undefined ? "" : String(value);
  if (typeof value === "string" && /^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function Card({ label, value, sub, children }: { label: string; value: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-semibold text-foreground mt-1 tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      {children}
    </div>
  );
}

// orgQuery is "?orgId=..." when the super admin manages another organization.
export function UsageTab({ orgQuery = "" }: { orgQuery?: string }) {
  const [month, setMonth] = useState(currentMonth());
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const orgParam = orgQuery ? `&${orgQuery.slice(1)}` : "";
        const res = await authedFetch(`/api/usage?month=${encodeURIComponent(month)}${orgParam}`);
        const body = await res.json();
        if (cancelled) return;
        if (res.ok) {
          setUsage(body);
        } else {
          setUsage(null);
          setError(body.error || "Couldn't load usage");
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't load usage");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [month, orgQuery]);

  const showCost = usage?.spend.totalCost !== undefined;

  const downloadCsv = () => {
    if (!usage) return;
    const header = ["Type", "Date", "Agent", "Lead", "Number", "Call type", "Talk time (s)", "Amount (USD)"];
    if (showCost) header.push("Telnyx cost (USD)");
    const rows: unknown[][] = [header];

    for (const c of usage.calls) {
      const row: unknown[] = [
        "Call",
        c.createdAt,
        c.agentEmail,
        c.leadName,
        c.leadPhone,
        c.mode === "browser" ? "Browser" : c.mode === "phone" ? "Phone" : "",
        c.talkSeconds,
        c.priceUsd ?? "",
      ];
      if (showCost) row.push(c.costUsd ?? "");
      rows.push(row);
    }
    for (const n of usage.numbers) {
      const row: unknown[] = ["Phone number", n.purchasedAt, "", "", n.phoneNumber, "", "", n.monthlyPrice + n.upfrontPrice];
      if (showCost) row.push((n.monthlyCost ?? 0) + (n.upfrontCost ?? 0));
      rows.push(row);
    }
    if (usage.stats.voiceMinutes > 0) {
      rows.push(["Voice assistant", usage.month, "", "", "", "", usage.stats.voiceMinutes * 60, usage.spend.voicePrice]);
    }
    const total: unknown[] = ["Total", "", "", "", "", "", "", usage.spend.totalPrice];
    if (showCost) total.push(usage.spend.totalCost);
    rows.push(total);

    const csv = rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${usage.org.name.replace(/[^a-z0-9]+/gi, "-")}-statement-${usage.month}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const budget = usage?.org.budgetUsd ?? null;
  const usedPct = usage && budget ? Math.min(100, Math.round((usage.spend.totalPrice / budget) * 100)) : 0;
  const recentCalls = usage ? [...usage.calls].reverse().slice(0, SHOWN_CALLS) : [];
  const hasUnpriced = !!usage?.calls.some((c) => c.priceUsd === null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <label htmlFor="usage-month" className="block text-xs text-muted-foreground mb-1">
            Month
          </label>
          <input
            id="usage-month"
            type="month"
            value={month}
            max={currentMonth()}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
            className="px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring"
          />
        </div>
        <button
          onClick={downloadCsv}
          disabled={!usage || loading}
          className="bg-secondary hover:bg-secondary/80 disabled:opacity-50 text-secondary-foreground font-medium py-2 px-4 rounded-lg text-sm transition-colors"
        >
          Download statement (CSV)
        </button>
      </div>

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">{error}</div>
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : (
        usage && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card
                label="Spent"
                value={money(usage.spend.totalPrice)}
                sub={budget !== null ? `of ${money(budget)} monthly budget` : "No budget limit"}
              >
                {budget !== null && (
                  <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden" aria-hidden="true">
                    <div
                      className={`h-full rounded-full ${usedPct >= 100 ? "bg-destructive" : usedPct >= 80 ? "bg-brand" : "bg-foreground/70"}`}
                      style={{ width: `${usedPct}%` }}
                    />
                  </div>
                )}
              </Card>
              <Card
                label="Calls"
                value={String(usage.stats.calls)}
                sub={`${usage.stats.connected} connected · ${money(usage.spend.callsPrice)}`}
              />
              <Card label="Talk time" value={`${Math.round(usage.stats.talkSeconds / 60)} min`} sub="Connected calls" />
              <Card
                label="Phone numbers"
                value={String(usage.stats.numbers)}
                sub={`${money(usage.spend.numbersPrice)} this month`}
              />
              {usage.stats.voiceMinutes > 0 && (
                <Card
                  label="Voice assistant"
                  value={`${usage.stats.voiceMinutes} min`}
                  sub={money(usage.spend.voicePrice)}
                />
              )}
              {showCost && (
                <Card
                  label="Telnyx cost"
                  value={money(usage.spend.totalCost)}
                  sub={`Margin ${money(usage.spend.totalPrice - (usage.spend.totalCost ?? 0))}`}
                />
              )}
            </div>

            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-border">
                <h2 className="text-sm font-semibold text-foreground">Calls</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Billed per started minute. Phone calls also include the time your phone was connected.
                  {hasUnpriced && " Calls with no amount were made before billing started or are still being priced."}
                </p>
              </div>
              {usage.calls.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground">No calls this month.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-muted border-b border-border">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Date</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Agent</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Lead</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Type</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Talk time</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Amount</th>
                        {showCost && (
                          <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Cost</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {recentCalls.map((c) => (
                        <tr key={c.id} className="hover:bg-muted/50 transition-colors">
                          <td className="px-6 py-3 text-sm text-muted-foreground whitespace-nowrap">
                            {new Date(c.createdAt).toLocaleString()}
                          </td>
                          <td className="px-6 py-3 text-sm text-foreground whitespace-nowrap">{c.agentEmail}</td>
                          <td className="px-6 py-3 text-sm text-foreground">
                            <div className="whitespace-nowrap">{c.leadName || "-"}</div>
                            {c.leadPhone && <div className="text-xs text-muted-foreground font-mono">{c.leadPhone}</div>}
                          </td>
                          <td className="px-6 py-3 text-sm text-muted-foreground">
                            {c.mode === "browser" ? "Browser" : c.mode === "phone" ? "Phone" : "-"}
                          </td>
                          <td className="px-6 py-3 text-sm text-foreground text-right tabular-nums">{talkTime(c.talkSeconds)}</td>
                          <td className="px-6 py-3 text-sm text-foreground text-right tabular-nums">{precise(c.priceUsd)}</td>
                          {showCost && (
                            <td className="px-6 py-3 text-sm text-muted-foreground text-right tabular-nums" title={c.note || undefined}>
                              {precise(c.costUsd)}
                              {c.note && " *"}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {usage.calls.length > SHOWN_CALLS && (
                <div className="px-6 py-3 border-t border-border text-xs text-muted-foreground">
                  Showing the latest {SHOWN_CALLS} of {usage.calls.length} calls. The CSV has all of them.
                </div>
              )}
            </div>

            {usage.numbers.length > 0 && (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-6 py-4 border-b border-border">
                  <h2 className="text-sm font-semibold text-foreground">Phone numbers</h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    Each number is billed for every month it&apos;s held, plus its upfront price in the month it was
                    bought.
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-muted border-b border-border">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Number</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Held</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Monthly</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Upfront</th>
                        {showCost && (
                          <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Cost</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {usage.numbers.map((n) => (
                        <tr key={`${n.phoneNumber}-${n.purchasedAt}`} className="hover:bg-muted/50 transition-colors">
                          <td className="px-6 py-3 text-sm text-foreground font-mono whitespace-nowrap">{n.phoneNumber}</td>
                          <td className="px-6 py-3 text-sm text-muted-foreground whitespace-nowrap">
                            Since {new Date(n.purchasedAt).toLocaleDateString()}
                            {n.releasedAt && `, released ${new Date(n.releasedAt).toLocaleDateString()}`}
                          </td>
                          <td className="px-6 py-3 text-sm text-foreground text-right tabular-nums">{money(n.monthlyPrice)}</td>
                          <td className="px-6 py-3 text-sm text-foreground text-right tabular-nums">
                            {n.upfrontPrice ? money(n.upfrontPrice) : "-"}
                          </td>
                          {showCost && (
                            <td className="px-6 py-3 text-sm text-muted-foreground text-right tabular-nums">
                              {money((n.monthlyCost ?? 0) + (n.upfrontCost ?? 0))}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { authedFetch } from "@/lib/voice-agent/authedFetch";

export type GrantSummary = {
  id: string;
  kind: "credit" | "minutes";
  amountUsd: number | null;
  minutes: number | null;
  countryCode: string | null;
  left: number;
  status: "active" | "scheduled" | "used_up" | "expired" | "revoked";
  startsAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  note: string | null;
  createdBy?: string;
  createdAt: string;
};

const STATUS: Record<GrantSummary["status"], { label: string; className: string }> = {
  active: { label: "Active", className: "bg-accent-green/15 text-accent-green-foreground" },
  scheduled: { label: "Scheduled", className: "bg-secondary text-foreground" },
  used_up: { label: "Used up", className: "bg-secondary text-muted-foreground" },
  expired: { label: "Expired", className: "bg-secondary text-muted-foreground" },
  revoked: { label: "Revoked", className: "bg-destructive/10 text-destructive" },
};

export function countryLabel(code: string | null) {
  if (!code) return "any country";
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) || code;
  } catch {
    return code;
  }
}

const money = (n: number | null | undefined) => `$${(n ?? 0).toFixed(2)}`;
const day = (iso: string) => new Date(iso).toLocaleDateString();

// "$40.00 left of $50.00" / "250 of 300 min left · Pakistan"
export function grantAmount(g: GrantSummary) {
  return g.kind === "credit"
    ? `${money(g.left)} left of ${money(g.amountUsd)}`
    : `${g.left} of ${g.minutes} min left · ${countryLabel(g.countryCode)}`;
}

export function grantDates(g: GrantSummary) {
  if (g.revokedAt) return `Revoked ${day(g.revokedAt)}`;
  return g.expiresAt ? `Given ${day(g.createdAt)} · usable until ${day(g.expiresAt)}` : `Given ${day(g.createdAt)} · no expiry`;
}

export function GrantStatusBadge({ status }: { status: GrantSummary["status"] }) {
  return (
    <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-md ${STATUS[status].className}`}>
      {STATUS[status].label}
    </span>
  );
}

const inputClass =
  "w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring";

const blurOnWheel = (e: React.WheelEvent<HTMLInputElement>) => e.currentTarget.blur();

// Give an organization free credit (a gift) or bonus minutes for a country,
// see what's left of each, and revoke what's unused.
export function GrantsDialog({
  org,
  onClose,
  onChanged,
}: {
  org: { id: string; name: string };
  onClose: () => void;
  onChanged: () => void;
}) {
  const [grants, setGrants] = useState<GrantSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<"credit" | "minutes">("credit");
  const [amountUsd, setAmountUsd] = useState("");
  const [minutes, setMinutes] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await authedFetch(`/api/super-admin/organizations/${org.id}/grants`);
        const body = await res.json().catch(() => ({}));
        if (res.ok) setGrants(body.grants || []);
        else setError(body.error || "Couldn't load credit and bonus minutes");
      } finally {
        setLoading(false);
      }
    })();
  }, [org.id]);

  const give = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/super-admin/organizations/${org.id}/grants`, {
        method: "POST",
        body: JSON.stringify(
          kind === "credit"
            ? { kind, amountUsd: Number(amountUsd), expiresOn: expiresOn || null, note }
            : { kind, minutes: Number(minutes), countryCode, expiresOn: expiresOn || null, note }
        ),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || "Couldn't save it");
        return;
      }
      setGrants(body.grants || []);
      setAmountUsd("");
      setMinutes("");
      setCountryCode("");
      setExpiresOn("");
      setNote("");
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  const revoke = async (grant: GrantSummary) => {
    setRevokingId(grant.id);
    setError(null);
    try {
      const res = await authedFetch(`/api/super-admin/grants/${grant.id}/revoke`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || "Couldn't revoke it");
        return;
      }
      setGrants(body.grants || []);
      onChanged();
    } finally {
      setRevokingId(null);
      setConfirmRevokeId(null);
    }
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4">
      <div className="w-full max-w-2xl max-h-full flex flex-col bg-card border border-border rounded-2xl shadow-lg">
        <div className="px-6 pt-6 pb-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">Free credit &amp; bonus minutes</h2>
          <p className="text-sm text-muted-foreground mt-1">
            For {org.name}. Credit pays any of their charges until it&apos;s used up, carrying over month to month.
            Bonus minutes make calls to leads in a country free. Neither counts against their budget, and they see
            both on their Usage tab.
          </p>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 py-5 space-y-6">
          <form onSubmit={give} className="space-y-4">
            <div className="inline-flex rounded-lg border border-border overflow-hidden" role="group" aria-label="What to give">
              {(
                [
                  ["credit", "Free credit"],
                  ["minutes", "Bonus minutes"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setKind(key)}
                  aria-pressed={kind === key}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    kind === key ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {kind === "credit" ? (
                <div>
                  <label htmlFor="grant-amount" className="block text-xs text-muted-foreground mb-1">
                    Amount (USD)
                  </label>
                  <input
                    id="grant-amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    value={amountUsd}
                    onChange={(e) => setAmountUsd(e.target.value)}
                    onWheel={blurOnWheel}
                    placeholder="50"
                    className={inputClass}
                  />
                </div>
              ) : (
                <>
                  <div>
                    <label htmlFor="grant-minutes" className="block text-xs text-muted-foreground mb-1">
                      Minutes
                    </label>
                    <input
                      id="grant-minutes"
                      type="number"
                      min="1"
                      step="1"
                      required
                      value={minutes}
                      onChange={(e) => setMinutes(e.target.value)}
                      onWheel={blurOnWheel}
                      placeholder="300"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label htmlFor="grant-country" className="block text-xs text-muted-foreground mb-1">
                      For calls to (country)
                    </label>
                    <input
                      id="grant-country"
                      type="text"
                      maxLength={2}
                      value={countryCode}
                      onChange={(e) => setCountryCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
                      placeholder="PK, or empty for any"
                      className={inputClass}
                    />
                  </div>
                </>
              )}
              <div>
                <label htmlFor="grant-expires" className="block text-xs text-muted-foreground mb-1">
                  Usable until (optional)
                </label>
                <input
                  id="grant-expires"
                  type="date"
                  min={today}
                  value={expiresOn}
                  onChange={(e) => setExpiresOn(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label htmlFor="grant-note" className="block text-xs text-muted-foreground mb-1">
                Note (optional, they&apos;ll see it)
              </label>
              <input
                id="grant-note"
                type="text"
                maxLength={200}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Welcome gift"
                className={inputClass}
              />
            </div>

            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">{error}</div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground font-medium py-2 px-4 rounded-lg text-sm transition-all active:translate-y-px"
            >
              {saving ? "Saving..." : kind === "credit" ? "Give credit" : "Give minutes"}
            </button>
          </form>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">Given so far</h3>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : grants.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing yet.</p>
            ) : (
              <ul className="divide-y divide-border border border-border rounded-xl">
                {grants.map((g) => (
                  <li key={g.id} className="px-4 py-3 flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-foreground">
                          {g.kind === "credit" ? "Free credit" : "Bonus minutes"}
                        </span>
                        <GrantStatusBadge status={g.status} />
                      </div>
                      <div className="text-sm text-foreground tabular-nums">{grantAmount(g)}</div>
                      <div className="text-xs text-muted-foreground">
                        {grantDates(g)}
                        {g.note && ` · ${g.note}`}
                      </div>
                    </div>
                    {(g.status === "active" || g.status === "scheduled") &&
                      (confirmRevokeId === g.id ? (
                        <span className="flex items-center gap-2 text-xs">
                          <span className="text-muted-foreground">Stop what&apos;s left?</span>
                          <button
                            onClick={() => revoke(g)}
                            disabled={revokingId === g.id}
                            className="font-medium text-destructive hover:underline disabled:opacity-40"
                          >
                            {revokingId === g.id ? "Revoking..." : "Revoke"}
                          </button>
                          <button onClick={() => setConfirmRevokeId(null)} className="text-muted-foreground hover:underline">
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setConfirmRevokeId(g.id)}
                          className="text-xs font-medium text-destructive hover:underline"
                        >
                          Revoke
                        </button>
                      ))}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="px-6 py-4 border-t border-border flex justify-end">
          <button
            onClick={onClose}
            className="bg-secondary hover:bg-secondary/80 text-secondary-foreground font-medium py-2 px-4 rounded-lg text-sm transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

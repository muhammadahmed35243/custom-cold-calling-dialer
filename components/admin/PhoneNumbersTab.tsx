"use client";

import { useEffect, useState } from "react";
import { authedFetch } from "@/lib/voice-agent/authedFetch";
import type { PhoneNumber } from "@/lib/supabase";

type AvailableNumber = {
  phoneNumber: string;
  phoneNumberType: string;
  countryCode: string;
  monthlyCost: number | null;
  upfrontCost: number | null;
};

function formatCost(n: number | null) {
  return n === null ? "-" : `$${n.toFixed(2)}`;
}

export function PhoneNumbersTab() {
  const [owned, setOwned] = useState<PhoneNumber[]>([]);
  const [loadingOwned, setLoadingOwned] = useState(true);
  const [country, setCountry] = useState("US");
  const [areaCode, setAreaCode] = useState("");
  const [searchResults, setSearchResults] = useState<AvailableNumber[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<AvailableNumber | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadOwned = async () => {
    setLoadingOwned(true);
    try {
      const res = await authedFetch("/api/admin/phone-numbers");
      const body = await res.json();
      if (res.ok) setOwned(body.numbers || []);
      else setError(body.error || "Failed to load numbers");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load numbers");
    } finally {
      setLoadingOwned(false);
    }
  };

  useEffect(() => {
    loadOwned();
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setSearching(true);
    setError(null);
    setSearchResults(null);
    try {
      const params = new URLSearchParams({ country: country.trim() });
      if (areaCode.trim()) params.set("areaCode", areaCode.trim());
      const res = await authedFetch(`/api/admin/phone-numbers/search?${params.toString()}`);
      const body = await res.json();
      if (res.ok) setSearchResults(body.numbers || []);
      else setError(body.error || "Search failed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  };

  const handlePurchase = async () => {
    if (!confirming) return;
    setPurchasing(true);
    setError(null);
    try {
      const res = await authedFetch("/api/admin/phone-numbers/purchase", {
        method: "POST",
        body: JSON.stringify({
          phoneNumber: confirming.phoneNumber,
          countryCode: confirming.countryCode,
          monthlyCost: confirming.monthlyCost,
          upfrontCost: confirming.upfrontCost,
        }),
      });
      const body = await res.json();
      if (res.ok) {
        setConfirming(null);
        setSearchResults((prev) => prev?.filter((n) => n.phoneNumber !== confirming.phoneNumber) || null);
        await loadOwned();
      } else {
        setError(body.error || "Purchase failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Purchase failed");
    } finally {
      setPurchasing(false);
    }
  };

  const handleActivate = async (number: PhoneNumber) => {
    setBusyId(number.id);
    try {
      const res = await authedFetch(`/api/admin/phone-numbers/${number.id}/activate`, { method: "POST" });
      if (res.ok) await loadOwned();
      else setError((await res.json()).error || "Failed to activate");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to activate");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
          {error}
        </div>
      )}

      <div className="bg-card border border-border rounded-xl p-6">
        <h2 className="text-sm font-semibold text-foreground mb-1">Buy a Number</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Search Telnyx&apos;s available numbers by country. Cost varies a lot by country &mdash; check it before buying.
        </p>
        <form onSubmit={handleSearch} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Country (ISO code)</label>
            <input
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value.toUpperCase())}
              placeholder="US"
              maxLength={2}
              required
              className="w-24 px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Area code (optional)</label>
            <input
              type="text"
              value={areaCode}
              onChange={(e) => setAreaCode(e.target.value)}
              placeholder="415"
              className="w-28 px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring"
            />
          </div>
          <button
            type="submit"
            disabled={searching}
            className="bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground font-medium py-2 px-4 rounded-lg text-sm transition-all active:translate-y-px"
          >
            {searching ? "Searching..." : "Search"}
          </button>
        </form>

        {searchResults && (
          <div className="mt-5 border-t border-border pt-4">
            {searchResults.length === 0 ? (
              <p className="text-sm text-muted-foreground">No numbers found for that search.</p>
            ) : (
              <div className="space-y-2">
                {searchResults.map((n) => (
                  <div key={n.phoneNumber} className="flex items-center justify-between bg-secondary rounded-lg p-3">
                    <div>
                      <div className="text-sm font-mono text-foreground">{n.phoneNumber}</div>
                      <div className="text-xs text-muted-foreground">
                        {n.phoneNumberType} &middot; {formatCost(n.monthlyCost)}/mo &middot; {formatCost(n.upfrontCost)} upfront
                      </div>
                    </div>
                    <button
                      onClick={() => setConfirming(n)}
                      className="text-xs font-medium bg-primary hover:bg-primary/90 text-primary-foreground py-1.5 px-3 rounded-md transition-colors"
                    >
                      Buy
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4">
          <div className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-lg p-6 space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Confirm purchase</h3>
            <p className="text-sm text-foreground font-mono">{confirming.phoneNumber}</p>
            <p className="text-sm text-muted-foreground">
              {formatCost(confirming.monthlyCost)}/month, {formatCost(confirming.upfrontCost)} upfront. This charges
              the Telnyx account immediately.
            </p>
            <div className="flex gap-2 pt-2">
              <button
                onClick={handlePurchase}
                disabled={purchasing}
                className="flex-1 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground font-medium py-2 px-4 rounded-lg text-sm transition-all active:translate-y-px"
              >
                {purchasing ? "Buying..." : "Confirm Purchase"}
              </button>
              <button
                onClick={() => setConfirming(null)}
                disabled={purchasing}
                className="flex-1 bg-secondary hover:bg-secondary/80 text-secondary-foreground font-medium py-2 px-4 rounded-lg text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Owned Numbers</h2>
          <p className="text-xs text-muted-foreground mt-1">
            The active number is the default outbound caller ID for any agent without a specific number assigned
            (set per-agent in Manage Agents).
          </p>
        </div>
        {loadingOwned ? (
          <div className="p-6 text-sm text-muted-foreground">Loading...</div>
        ) : owned.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No numbers purchased yet.</div>
        ) : (
          <table className="w-full">
            <thead className="bg-muted border-b border-border">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Number</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Country</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Cost</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Purchased</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {owned.map((n) => (
                <tr key={n.id} className="hover:bg-muted/50 transition-colors">
                  <td className="px-6 py-4 text-sm text-foreground font-mono">{n.phone_number}</td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">{n.country_code}</td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">{formatCost(n.monthly_cost)}/mo</td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">{new Date(n.purchased_at).toLocaleDateString()}</td>
                  <td className="px-6 py-4 text-sm text-right">
                    {n.is_active ? (
                      <span className="text-xs font-medium bg-accent-green/15 text-accent-green-foreground px-2 py-0.5 rounded-md">Active</span>
                    ) : (
                      <button
                        onClick={() => handleActivate(n)}
                        disabled={busyId === n.id}
                        className="text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
                      >
                        Set Active
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { authedFetch } from "@/lib/voice-agent/authedFetch";
import type { PhoneNumber } from "@/lib/supabase";

type AvailableNumber = {
  phoneNumber: string;
  phoneNumberType: string;
  countryCode: string;
  // What the organization pays (Telnyx's price plus its number markup).
  monthlyPrice: number | null;
  upfrontPrice: number | null;
  // Telnyx's own price, only sent to JETZT.
  monthlyCost?: number | null;
  upfrontCost?: number | null;
};

function formatMoney(n: number | null | undefined) {
  return n === null || n === undefined ? "-" : `$${Number(n).toFixed(2)}`;
}

// orgQuery is "?orgId=..." when the super admin manages another organization,
// empty otherwise. canBuy is false when the organization's number limit is 0.
export function PhoneNumbersTab({ orgQuery = "", canBuy = true }: { orgQuery?: string; canBuy?: boolean }) {
  const [owned, setOwned] = useState<PhoneNumber[]>([]);
  const [limit, setLimit] = useState<number | null>(null);
  const [loadingOwned, setLoadingOwned] = useState(true);
  const [country, setCountry] = useState("US");
  const [areaCode, setAreaCode] = useState("");
  const [searchResults, setSearchResults] = useState<AvailableNumber[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<AvailableNumber | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [releasing, setReleasing] = useState<PhoneNumber | null>(null);
  const [releaseBusy, setReleaseBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const orgParam = orgQuery ? `&${orgQuery.slice(1)}` : "";
  const atLimit = limit !== null && owned.length >= limit;

  const loadOwned = async () => {
    setLoadingOwned(true);
    try {
      const res = await authedFetch(`/api/admin/phone-numbers${orgQuery}`);
      const body = await res.json();
      if (res.ok) {
        setOwned(body.numbers || []);
        setLimit(body.limit ?? null);
      } else {
        setError(body.error || "Failed to load numbers");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load numbers");
    } finally {
      setLoadingOwned(false);
    }
  };

  useEffect(() => {
    loadOwned();
    // orgQuery is fixed for the life of the admin page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setSearching(true);
    setError(null);
    setSearchResults(null);
    try {
      const params = new URLSearchParams({ country: country.trim() });
      if (areaCode.trim()) params.set("areaCode", areaCode.trim());
      const res = await authedFetch(`/api/admin/phone-numbers/search?${params.toString()}${orgParam}`);
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
      // The server looks up the price itself; only the number is sent.
      const res = await authedFetch(`/api/admin/phone-numbers/purchase${orgQuery}`, {
        method: "POST",
        body: JSON.stringify({ phoneNumber: confirming.phoneNumber, countryCode: confirming.countryCode }),
      });
      const body = await res.json();
      if (res.ok) {
        setSearchResults((prev) => prev?.filter((n) => n.phoneNumber !== confirming.phoneNumber) || null);
        setConfirming(null);
        await loadOwned();
      } else {
        setConfirming(null);
        setError(body.error || "Purchase failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Purchase failed");
    } finally {
      setPurchasing(false);
    }
  };

  const handleRelease = async () => {
    if (!releasing) return;
    setReleaseBusy(true);
    setError(null);
    try {
      const res = await authedFetch(`/api/admin/phone-numbers/${releasing.id}/release`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) setError(body.error || "Failed to release the number");
      setReleasing(null);
      await loadOwned();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to release the number");
    } finally {
      setReleaseBusy(false);
    }
  };

  const handleActivate = async (number: PhoneNumber) => {
    setBusyId(number.id);
    setError(null);
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

      {!canBuy ? (
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="text-sm font-semibold text-foreground mb-1">Need a number?</h2>
          <p className="text-sm text-muted-foreground">
            Your organization can&apos;t buy numbers right now. Ask JETZT to raise your number limit.
          </p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="text-sm font-semibold text-foreground mb-1">Buy a Number</h2>
          <p className="text-xs text-muted-foreground mb-4">
            Search available numbers by country. Prices vary a lot by country &mdash; check before buying. Numbers are
            billed every month until you release them.
          </p>
          {atLimit ? (
            <p className="text-sm text-muted-foreground">
              You have {limit} of {limit} numbers. Release one below to buy another, or ask JETZT to raise the limit.
            </p>
          ) : (
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
          )}

          {searchResults && !atLimit && (
            <div className="mt-5 border-t border-border pt-4">
              {searchResults.length === 0 ? (
                <p className="text-sm text-muted-foreground">No numbers found for that search.</p>
              ) : (
                <div className="space-y-2">
                  {searchResults.map((n) => (
                    <div key={n.phoneNumber} className="flex items-center justify-between gap-3 bg-secondary rounded-lg p-3">
                      <div className="min-w-0">
                        <div className="text-sm font-mono text-foreground">{n.phoneNumber}</div>
                        <div className="text-xs text-muted-foreground">
                          {n.phoneNumberType} &middot; {formatMoney(n.monthlyPrice)}/mo &middot;{" "}
                          {formatMoney(n.upfrontPrice)} upfront
                          {n.monthlyCost !== undefined && (
                            <span>
                              {" "}
                              &middot; Telnyx cost {formatMoney(n.monthlyCost)}/mo, {formatMoney(n.upfrontCost)} upfront
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => setConfirming(n)}
                        className="shrink-0 text-xs font-medium bg-primary hover:bg-primary/90 text-primary-foreground py-1.5 px-3 rounded-md transition-colors"
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
      )}

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4">
          <div className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-lg p-6 space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Confirm purchase</h3>
            <p className="text-sm text-foreground font-mono">{confirming.phoneNumber}</p>
            <p className="text-sm text-muted-foreground">
              {formatMoney(confirming.monthlyPrice)} a month plus {formatMoney(confirming.upfrontPrice)} upfront, added to
              this organization&apos;s bill until the number is released.
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

      {releasing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4">
          <div className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-lg p-6 space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Release this number?</h3>
            <p className="text-sm text-foreground font-mono">{releasing.phone_number}</p>
            <p className="text-sm text-muted-foreground">
              It goes back to Telnyx and its monthly charge stops. You can&apos;t get this number back afterwards.
              Agents using it switch to your default number.
            </p>
            <div className="flex gap-2 pt-2">
              <button
                onClick={handleRelease}
                disabled={releaseBusy}
                className="flex-1 bg-destructive hover:bg-destructive/90 disabled:opacity-50 text-white font-medium py-2 px-4 rounded-lg text-sm transition-all active:translate-y-px"
              >
                {releaseBusy ? "Releasing..." : "Release Number"}
              </button>
              <button
                onClick={() => setReleasing(null)}
                disabled={releaseBusy}
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
          <h2 className="text-sm font-semibold text-foreground">
            Owned Numbers{limit !== null && !loadingOwned ? ` (${owned.length} of ${limit})` : ""}
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            The active number is the default outbound caller ID for any agent without a specific number assigned
            (set per-agent in Manage Agents).
          </p>
        </div>
        {loadingOwned ? (
          <div className="p-6 text-sm text-muted-foreground">Loading...</div>
        ) : owned.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No numbers yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted border-b border-border">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Number</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Country</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Monthly</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">Purchased</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {owned.map((n) => (
                  <tr key={n.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-4 text-sm text-foreground font-mono whitespace-nowrap">{n.phone_number}</td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">{n.country_code}</td>
                    <td className="px-6 py-4 text-sm text-muted-foreground whitespace-nowrap">
                      {formatMoney(n.monthly_price ?? n.monthly_cost)}/mo
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground whitespace-nowrap">
                      {new Date(n.purchased_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-sm text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-3">
                        {n.is_active ? (
                          <span className="text-xs font-medium bg-accent-green/15 text-accent-green-foreground px-2 py-0.5 rounded-md">
                            Active
                          </span>
                        ) : (
                          <button
                            onClick={() => handleActivate(n)}
                            disabled={busyId === n.id}
                            className="text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
                          >
                            Set Active
                          </button>
                        )}
                        <button
                          onClick={() => setReleasing(n)}
                          className="text-xs font-medium text-destructive hover:underline underline-offset-2"
                        >
                          Release
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

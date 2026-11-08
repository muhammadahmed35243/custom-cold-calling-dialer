"use client";

import { useEffect, useMemo, useState } from "react";
import { authedFetch } from "@/lib/voice-agent/authedFetch";
import type { PhoneNumber } from "@/lib/supabase";

type AvailableNumber = {
  phoneNumber: string;
  display: string;
  phoneNumberType: string;
  countryCode: string;
  locality: string | null;
  region: string | null;
  rateCenter: string | null;
  features: string[];
  bestEffort: boolean;
  quickship: boolean;
  // What the organization pays (Telnyx's price plus its number markup).
  monthlyPrice: number | null;
  upfrontPrice: number | null;
  // Telnyx's own price, only sent to JETZT.
  monthlyCost?: number | null;
  upfrontCost?: number | null;
};

type SearchFilters = {
  country: string;
  type: string;
  areaCode: string;
  city: string;
  state: string;
  contains: string;
  features: string[];
};

type Sort = "price-asc" | "price-desc" | "upfront-asc" | "city" | "number";

const TYPE_LABELS: Record<string, string> = {
  local: "Local",
  toll_free: "Toll-free",
  mobile: "Mobile",
  national: "National",
};

// Shown in this order on each number.
const FEATURE_LABELS: [string, string][] = [
  ["voice", "Voice"],
  ["sms", "SMS"],
  ["mms", "MMS"],
  ["fax", "Fax"],
  ["emergency", "911"],
  ["hd_voice", "HD voice"],
];

const FEATURE_FILTERS: [string, string][] = [
  ["sms", "SMS"],
  ["mms", "MMS"],
  ["fax", "Fax"],
  ["emergency", "911 calling"],
];

const EMPTY_FILTERS: SearchFilters = { country: "US", type: "", areaCode: "", city: "", state: "", contains: "", features: [] };

const inputClass =
  "w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring";

function formatMoney(n: number | null | undefined) {
  return n === null || n === undefined ? "-" : `$${Number(n).toFixed(2)}`;
}

function location(n: AvailableNumber) {
  return [n.locality, n.region].filter(Boolean).join(", ") || n.countryCode;
}

// "US · area code 415 · Local · with SMS, MMS"
function describeSearch(f: SearchFilters) {
  const parts = [f.country];
  if (f.type) parts.push(TYPE_LABELS[f.type] || f.type);
  if (f.areaCode) parts.push(`area code ${f.areaCode}`);
  if (f.city) parts.push(f.city);
  if (f.state) parts.push(f.state);
  if (f.contains) parts.push(`containing ${f.contains}`);
  if (f.features.length) {
    parts.push(`with ${f.features.map((k) => FEATURE_FILTERS.find(([key]) => key === k)?.[1] || k).join(", ")}`);
  }
  return parts.join(" · ");
}

function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "green" | "brand" }) {
  const tones = {
    neutral: "bg-background text-foreground border border-border",
    green: "bg-accent-green/15 text-accent-green-foreground",
    brand: "bg-brand/15 text-foreground",
  };
  return <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-md ${tones[tone]}`}>{children}</span>;
}

// orgQuery is "?orgId=..." when the super admin manages another organization,
// empty otherwise. canBuy is false when the organization's number limit is 0.
export function PhoneNumbersTab({ orgQuery = "", canBuy = true }: { orgQuery?: string; canBuy?: boolean }) {
  const [owned, setOwned] = useState<PhoneNumber[]>([]);
  const [limit, setLimit] = useState<number | null>(null);
  const [loadingOwned, setLoadingOwned] = useState(true);
  const [filters, setFilters] = useState<SearchFilters>(EMPTY_FILTERS);
  const [searchedFor, setSearchedFor] = useState<SearchFilters | null>(null);
  const [searchResults, setSearchResults] = useState<AvailableNumber[] | null>(null);
  const [sort, setSort] = useState<Sort>("price-asc");
  const [maxMonthly, setMaxMonthly] = useState("");
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<AvailableNumber | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [releasing, setReleasing] = useState<PhoneNumber | null>(null);
  const [releaseBusy, setReleaseBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const orgParam = orgQuery ? `&${orgQuery.slice(1)}` : "";
  const atLimit = limit !== null && owned.length >= limit;

  const setFilter = <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const toggleFeature = (key: string) =>
    setFilters((prev) => ({
      ...prev,
      features: prev.features.includes(key) ? prev.features.filter((f) => f !== key) : [...prev.features, key],
    }));

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
    const query: SearchFilters = {
      ...filters,
      country: filters.country.trim().toUpperCase(),
      areaCode: filters.areaCode.trim(),
      city: filters.city.trim(),
      state: filters.state.trim().toUpperCase(),
      contains: filters.contains.trim(),
    };
    setSearching(true);
    setError(null);
    setSearchResults(null);
    try {
      const params = new URLSearchParams({ country: query.country });
      if (query.type) params.set("type", query.type);
      if (query.areaCode) params.set("areaCode", query.areaCode);
      if (query.city) params.set("city", query.city);
      if (query.state) params.set("state", query.state);
      if (query.contains) params.set("contains", query.contains);
      if (query.features.length) params.set("features", query.features.join(","));
      const res = await authedFetch(`/api/admin/phone-numbers/search?${params.toString()}${orgParam}`);
      const body = await res.json();
      if (res.ok) {
        setSearchResults(body.numbers || []);
        setSearchedFor(query);
      } else {
        setError(body.error || "Search failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  };

  // Max price and sorting apply to the results on screen, without searching again.
  const visibleResults = useMemo(() => {
    if (!searchResults) return [];
    const max = maxMonthly.trim() === "" ? null : Number(maxMonthly);
    const price = (n: number | null) => (n === null ? Number.POSITIVE_INFINITY : n);
    const list = searchResults.filter((n) => max === null || Number.isNaN(max) || price(n.monthlyPrice) <= max);
    const byNumber = (a: AvailableNumber, b: AvailableNumber) => a.phoneNumber.localeCompare(b.phoneNumber);
    const sorted = [...list];
    switch (sort) {
      case "price-asc":
        sorted.sort((a, b) => price(a.monthlyPrice) - price(b.monthlyPrice) || price(a.upfrontPrice) - price(b.upfrontPrice) || byNumber(a, b));
        break;
      case "price-desc":
        sorted.sort((a, b) => price(b.monthlyPrice) - price(a.monthlyPrice) || price(b.upfrontPrice) - price(a.upfrontPrice) || byNumber(a, b));
        break;
      case "upfront-asc":
        sorted.sort((a, b) => price(a.upfrontPrice) - price(b.upfrontPrice) || price(a.monthlyPrice) - price(b.monthlyPrice) || byNumber(a, b));
        break;
      case "city":
        sorted.sort((a, b) => location(a).localeCompare(location(b)) || byNumber(a, b));
        break;
      case "number":
        sorted.sort(byNumber);
        break;
    }
    return sorted;
  }, [searchResults, sort, maxMonthly]);

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

  const featureChips = (n: AvailableNumber) =>
    FEATURE_LABELS.filter(([key]) => n.features.includes(key)).map(([key, label]) => (
      <span key={key} className="text-[11px] text-muted-foreground bg-background border border-border rounded px-1.5 py-0.5">
        {label}
      </span>
    ));

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
            Search available numbers. Prices vary a lot by country, area and type &mdash; check before buying. Numbers
            are billed every month until you release them.
          </p>

          {atLimit ? (
            <p className="text-sm text-muted-foreground">
              You have {limit} of {limit} numbers. Release one below to buy another, or ask JETZT to raise the limit.
            </p>
          ) : (
            <form onSubmit={handleSearch} className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <div>
                  <label htmlFor="num-country" className="block text-xs text-muted-foreground mb-1">
                    Country
                  </label>
                  <input
                    id="num-country"
                    type="text"
                    value={filters.country}
                    onChange={(e) => setFilter("country", e.target.value.toUpperCase())}
                    placeholder="US"
                    maxLength={2}
                    required
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="num-type" className="block text-xs text-muted-foreground mb-1">
                    Type
                  </label>
                  <select
                    id="num-type"
                    value={filters.type}
                    onChange={(e) => setFilter("type", e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Any type</option>
                    <option value="local">Local</option>
                    <option value="toll_free">Toll-free</option>
                    <option value="mobile">Mobile</option>
                    <option value="national">National</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="num-area" className="block text-xs text-muted-foreground mb-1">
                    Area code
                  </label>
                  <input
                    id="num-area"
                    type="text"
                    inputMode="numeric"
                    value={filters.areaCode}
                    onChange={(e) => setFilter("areaCode", e.target.value.replace(/\D/g, ""))}
                    placeholder="415"
                    maxLength={5}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="num-city" className="block text-xs text-muted-foreground mb-1">
                    City
                  </label>
                  <input
                    id="num-city"
                    type="text"
                    value={filters.city}
                    onChange={(e) => setFilter("city", e.target.value)}
                    placeholder="Chicago"
                    maxLength={60}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="num-state" className="block text-xs text-muted-foreground mb-1">
                    State
                  </label>
                  <input
                    id="num-state"
                    type="text"
                    value={filters.state}
                    onChange={(e) => setFilter("state", e.target.value.toUpperCase())}
                    placeholder="IL"
                    maxLength={6}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="num-contains" className="block text-xs text-muted-foreground mb-1">
                    Contains digits
                  </label>
                  <input
                    id="num-contains"
                    type="text"
                    inputMode="numeric"
                    value={filters.contains}
                    onChange={(e) => setFilter("contains", e.target.value.replace(/\D/g, ""))}
                    placeholder="777"
                    maxLength={10}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <legend className="sr-only">Must support</legend>
                  <span className="text-xs text-muted-foreground">Must support:</span>
                  {FEATURE_FILTERS.map(([key, label]) => (
                    <label key={key} className="flex items-center gap-1.5 text-sm text-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filters.features.includes(key)}
                        onChange={() => toggleFeature(key)}
                        className="rounded border-border"
                      />
                      {label}
                    </label>
                  ))}
                </fieldset>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setFilters(EMPTY_FILTERS)}
                    className="text-sm text-muted-foreground hover:text-foreground px-3 py-2 transition-colors"
                  >
                    Clear
                  </button>
                  <button
                    type="submit"
                    disabled={searching}
                    className="bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground font-medium py-2 px-4 rounded-lg text-sm transition-all active:translate-y-px"
                  >
                    {searching ? "Searching..." : "Search"}
                  </button>
                </div>
              </div>
            </form>
          )}

          {searchResults && searchedFor && !atLimit && (
            <div className="mt-5 border-t border-border pt-4 space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  <span className="text-foreground font-medium">
                    {visibleResults.length === searchResults.length
                      ? `${searchResults.length} number${searchResults.length === 1 ? "" : "s"}`
                      : `${visibleResults.length} of ${searchResults.length} numbers`}
                  </span>{" "}
                  for {describeSearch(searchedFor)}
                </p>
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label htmlFor="num-max" className="block text-xs text-muted-foreground mb-1">
                      Max per month ($)
                    </label>
                    <input
                      id="num-max"
                      type="number"
                      min={0}
                      step="0.01"
                      value={maxMonthly}
                      onChange={(e) => setMaxMonthly(e.target.value)}
                      onWheel={(e) => (e.target as HTMLInputElement).blur()}
                      placeholder="Any"
                      className={`${inputClass} w-28`}
                    />
                  </div>
                  <div>
                    <label htmlFor="num-sort" className="block text-xs text-muted-foreground mb-1">
                      Sort by
                    </label>
                    <select id="num-sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)} className={inputClass}>
                      <option value="price-asc">Monthly price: low to high</option>
                      <option value="price-desc">Monthly price: high to low</option>
                      <option value="upfront-asc">Upfront price: low to high</option>
                      <option value="city">City (A to Z)</option>
                      <option value="number">Number</option>
                    </select>
                  </div>
                </div>
              </div>

              {searchResults.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No numbers match. Try removing a filter &mdash; Telnyx may have none in that area right now.
                </p>
              ) : visibleResults.length === 0 ? (
                <p className="text-sm text-muted-foreground">No numbers at or under that monthly price.</p>
              ) : (
                <div className="space-y-2">
                  {visibleResults.map((n) => (
                    <div
                      key={n.phoneNumber}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-secondary rounded-lg p-4"
                    >
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-mono font-medium text-foreground">{n.display}</span>
                          <Badge>{TYPE_LABELS[n.phoneNumberType] || n.phoneNumberType}</Badge>
                          {n.quickship && <Badge tone="green">Ready now</Badge>}
                          {n.bestEffort && <Badge tone="brand">Close match</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground" title={n.rateCenter ? `Rate center: ${n.rateCenter}` : undefined}>
                          {location(n)}
                        </div>
                        <div className="flex flex-wrap gap-1">{featureChips(n)}</div>
                      </div>
                      <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                        <div className="sm:text-right">
                          <div className="text-sm font-semibold text-foreground tabular-nums">
                            {formatMoney(n.monthlyPrice)}
                            <span className="text-xs font-normal text-muted-foreground">/mo</span>
                          </div>
                          <div className="text-xs text-muted-foreground tabular-nums">
                            {formatMoney(n.upfrontPrice)} upfront
                          </div>
                          {n.monthlyCost !== undefined && (
                            <div className="text-[11px] text-muted-foreground tabular-nums">
                              Telnyx {formatMoney(n.monthlyCost)}/mo &middot; {formatMoney(n.upfrontCost)}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => setConfirming(n)}
                          className="text-xs font-medium bg-primary hover:bg-primary/90 text-primary-foreground py-1.5 px-3 rounded-md transition-colors"
                        >
                          Buy
                        </button>
                      </div>
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
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-base text-foreground font-mono font-medium">{confirming.display}</span>
                <Badge>{TYPE_LABELS[confirming.phoneNumberType] || confirming.phoneNumberType}</Badge>
              </div>
              <div className="text-sm text-muted-foreground">{location(confirming)}</div>
              <div className="flex flex-wrap gap-1">{featureChips(confirming)}</div>
            </div>
            <dl className="grid grid-cols-2 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Monthly</dt>
              <dd className="text-right text-foreground tabular-nums">{formatMoney(confirming.monthlyPrice)}</dd>
              <dt className="text-muted-foreground">Upfront</dt>
              <dd className="text-right text-foreground tabular-nums">{formatMoney(confirming.upfrontPrice)}</dd>
              <dt className="text-foreground font-medium">This month</dt>
              <dd className="text-right text-foreground font-medium tabular-nums">
                {formatMoney((confirming.monthlyPrice ?? 0) + (confirming.upfrontPrice ?? 0))}
              </dd>
            </dl>
            <p className="text-xs text-muted-foreground">
              Added to this organization&apos;s bill every month until the number is released.
            </p>
            <div className="flex gap-2 pt-1">
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

import { supabaseServiceClient } from "./supabase";

// Free credit and bonus minutes the super admin gives an organization
// (org_grants, migration 0012). Credit is applied month by month in
// lib/billing.ts; bonus minutes come off each call's billed minutes here.

export type Grant = {
  id: string;
  org_id: string;
  kind: "credit" | "minutes";
  amount_usd: number | null;
  minutes: number | null;
  country_code: string | null;
  starts_at: string;
  expires_at: string | null;
  note: string | null;
  created_by: string;
  created_at: string;
  revoked_at: string | null;
};

export async function loadGrants(orgId: string, kind?: Grant["kind"]): Promise<Grant[]> {
  let query = supabaseServiceClient
    .from("org_grants")
    .select("id, org_id, kind, amount_usd, minutes, country_code, starts_at, expires_at, note, created_by, created_at, revoked_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });
  if (kind) query = query.eq("kind", kind);
  const { data, error } = await query;
  if (error) throw new Error(`Couldn't load credit and bonus minutes: ${error.message}`);
  return (data || []).map((g: any) => ({
    ...g,
    amount_usd: g.amount_usd != null ? Number(g.amount_usd) : null,
    minutes: g.minutes != null ? Number(g.minutes) : null,
  }));
}

// When a grant stops applying: its expiry or its revocation, whichever comes
// first (ms since epoch); null when it has neither.
export function grantEnd(grant: Grant): number | null {
  const ends = [grant.expires_at, grant.revoked_at].filter((d): d is string => !!d).map((d) => Date.parse(d));
  return ends.length ? Math.min(...ends) : null;
}

export function grantActiveAt(grant: Grant, at: number): boolean {
  const end = grantEnd(grant);
  return Date.parse(grant.starts_at) <= at && (end === null || at < end);
}

// Sooner-ending grants are used first, so less goes to waste.
export function bySoonestEnd(a: Grant, b: Grant): number {
  return (grantEnd(a) ?? Number.POSITIVE_INFINITY) - (grantEnd(b) ?? Number.POSITIVE_INFINITY) || a.created_at.localeCompare(b.created_at);
}

// Bonus minutes each grant has given to calls, optionally leaving one call
// out (when that call is being priced again).
export async function bonusMinutesUsed(grantIds: string[], excludeCallId?: string): Promise<Map<string, number>> {
  const used = new Map(grantIds.map((id) => [id, 0]));
  if (!grantIds.length) return used;

  for (let from = 0; ; from += 1000) {
    let query = supabaseServiceClient
      .from("calls")
      .select("bonus_grant_id, bonus_minutes")
      .in("bonus_grant_id", grantIds)
      .range(from, from + 999);
    if (excludeCallId) query = query.neq("id", excludeCallId);
    const { data, error } = await query;
    if (error) throw new Error(`Couldn't count bonus minutes used: ${error.message}`);
    for (const row of data || []) {
      used.set(row.bonus_grant_id, (used.get(row.bonus_grant_id) || 0) + (row.bonus_minutes || 0));
    }
    if (!data || data.length < 1000) return used;
  }
}

// How many of a call's billed minutes are free, and from which grant: a grant
// active when the call started, for the lead's country (or any country),
// country-specific grants first, then the one ending soonest. One grant per
// call; minutes it can't cover are billed as usual. Safe to run again for the
// same call.
export async function applyBonusMinutes(opts: {
  callId: string;
  orgId: string;
  callStartedAt: string;
  countryCode: string | null;
  billedMinutes: number;
}): Promise<{ grantId: string | null; minutes: number }> {
  const none = { grantId: null, minutes: 0 };
  if (opts.billedMinutes <= 0) return none;

  const at = Date.parse(opts.callStartedAt);
  const grants = (await loadGrants(opts.orgId, "minutes"))
    .filter((g) => grantActiveAt(g, at) && (!g.country_code || g.country_code === opts.countryCode))
    .sort((a, b) => (a.country_code ? 0 : 1) - (b.country_code ? 0 : 1) || bySoonestEnd(a, b));
  if (!grants.length) return none;

  const used = await bonusMinutesUsed(grants.map((g) => g.id), opts.callId);
  for (const grant of grants) {
    const left = (grant.minutes || 0) - (used.get(grant.id) || 0);
    if (left > 0) return { grantId: grant.id, minutes: Math.min(opts.billedMinutes, left) };
  }
  return none;
}

export type GrantStatus = "active" | "scheduled" | "used_up" | "expired" | "revoked";

export function grantStatus(grant: Grant, left: number, now = Date.now()): GrantStatus {
  if (grant.revoked_at && Date.parse(grant.revoked_at) <= now) return "revoked";
  if (grant.expires_at && Date.parse(grant.expires_at) <= now) return "expired";
  if (Date.parse(grant.starts_at) > now) return "scheduled";
  return left > 0 ? "active" : "used_up";
}

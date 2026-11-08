import { parsePhoneNumberFromString } from "libphonenumber-js";
import { supabaseServiceClient } from "./supabase";
import type { Organization } from "./authz";
import {
  applyBonusMinutes,
  bonusMinutesUsed,
  bySoonestEnd,
  grantEnd,
  grantStatus,
  loadGrants,
  type Grant,
  type GrantStatus,
} from "./grants";

// What calls cost JETZT and what organizations pay. Costs come from Telnyx's
// rate deck (the call_rates table, loaded by scripts/import-rate-deck.mjs);
// every Telnyx rate bills per started minute. An organization's price is the
// cost plus its markup, fixed when the call is billed.

export type Rate = {
  destination_prefix: string;
  origination: "" | "local";
  country_code: string;
  rate_per_min: number;
  price_per_call: number;
};

// Digits of a phone number, also accepting a SIP URI ("sip:+1555...@host").
export function phoneDigits(value: string | null | undefined): string {
  return (value || "").split("@")[0].replace(/\D/g, "");
}

function countryOf(digits: string): string | null {
  if (!digits) return null;
  return parsePhoneNumberFromString(`+${digits}`)?.country ?? null;
}

export function countryName(code: string | null | undefined): string {
  if (!code) return "that country";
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) || code;
  } catch {
    return code;
  }
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

function longestPrefix(rows: Rate[]): Rate | undefined {
  return [...rows].sort((a, b) => b.destination_prefix.length - a.destination_prefix.length)[0];
}

// Telnyx's rate for calling `destination` with `callerId` as caller ID: the
// longest matching prefix, using the 'local' rate when both numbers are in
// the same country and the deck has one.
export async function findRate(destination: string | null | undefined, callerId?: string | null): Promise<Rate | null> {
  const digits = phoneDigits(destination);
  if (digits.length < 3) return null;

  const candidates = Array.from({ length: Math.min(digits.length, 15) }, (_, i) => digits.slice(0, i + 1));
  const { data, error } = await supabaseServiceClient
    .from("call_rates")
    .select("destination_prefix, origination, country_code, rate_per_min, price_per_call")
    .in("destination_prefix", candidates);
  if (error || !data?.length) return null;

  const rows: Rate[] = data.map((r: any) => ({
    destination_prefix: r.destination_prefix,
    origination: r.origination,
    country_code: r.country_code,
    rate_per_min: Number(r.rate_per_min),
    price_per_call: Number(r.price_per_call) || 0,
  }));

  const standard = longestPrefix(rows.filter((r) => r.origination === ""));
  const destinationCountry = standard?.country_code ?? countryOf(digits);
  const callerDigits = phoneDigits(callerId);
  if (callerDigits && destinationCountry && countryOf(callerDigits) === destinationCountry) {
    const local = longestPrefix(rows.filter((r) => r.origination === "local"));
    if (local) return local;
  }
  return standard ?? null;
}

// Cost of one leg: started minutes x rate, plus any per-call fee once the
// leg was actually answered.
export function legCost(seconds: number | null | undefined, rate: Rate | null): number {
  if (!seconds || seconds <= 0 || !rate) return 0;
  return Math.ceil(seconds / 60) * rate.rate_per_min + rate.price_per_call;
}

export function withMarkup(cost: number, markupPct: number | null | undefined): number {
  return cost * (1 + (Number(markupPct) || 0) / 100);
}

// A phone number's price for an organization, in whole cents. Fixed when the
// number is bought, so later markup changes don't rewrite past statements.
export function numberPrice(cost: number | null | undefined, markupPct: number | null | undefined): number | null {
  if (cost == null || !Number.isFinite(Number(cost))) return null;
  return Math.round(withMarkup(Number(cost), markupPct) * 100) / 100;
}

function one<T>(value: T | T[] | null | undefined): T | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

// Prices a call from the leg durations Telnyx reported. Safe to run more
// than once: each run recomputes from what's stored, so webhooks arriving in
// any order end with the right total.
export async function finalizeCallCost(callId: string): Promise<void> {
  const { data: call } = await supabaseServiceClient
    .from("calls")
    .select(
      "id, org_id, created_at, mode, caller_id_number, agent_phone_number, agent_leg_seconds, lead_leg_seconds, leads(phone), organizations(call_markup_pct)"
    )
    .eq("id", callId)
    .maybeSingle();
  if (!call) return;

  const lead = one(call.leads as { phone: string } | { phone: string }[] | null);
  const org = one(call.organizations as { call_markup_pct: number } | { call_markup_pct: number }[] | null);
  const notes: string[] = [];
  let cost = 0;
  let leadRate: Rate | null = null;

  if ((call.lead_leg_seconds ?? 0) > 0) {
    leadRate = await findRate(lead?.phone, call.caller_id_number);
    if (leadRate) cost += legCost(call.lead_leg_seconds, leadRate);
    else notes.push("No Telnyx rate for the lead's number");
  }

  // Phone-bridge calls also pay for Telnyx ringing the agent's own phone.
  if (call.mode === "phone" && (call.agent_leg_seconds ?? 0) > 0) {
    const rate = await findRate(call.agent_phone_number, call.caller_id_number);
    if (rate) cost += legCost(call.agent_leg_seconds, rate);
    else notes.push("No Telnyx rate for the agent's phone");
  }

  // Bonus minutes the organization was given for this country cover the
  // lead's minutes first: those minutes are free (JETZT still pays Telnyx).
  let price = withMarkup(cost, org?.call_markup_pct);
  let bonus: { grantId: string | null; minutes: number } = { grantId: null, minutes: 0 };
  if (leadRate && (call.lead_leg_seconds ?? 0) > 0) {
    try {
      bonus = await applyBonusMinutes({
        callId: call.id,
        orgId: call.org_id,
        callStartedAt: call.created_at,
        countryCode: leadRate.country_code,
        billedMinutes: Math.ceil(call.lead_leg_seconds / 60),
      });
    } catch (err) {
      console.error("Billing: couldn't apply bonus minutes", { callId, err });
    }
    if (bonus.minutes) price -= withMarkup(bonus.minutes * leadRate.rate_per_min, org?.call_markup_pct);
  }

  const { error } = await supabaseServiceClient
    .from("calls")
    .update({
      cost_usd: round6(cost),
      price_usd: round6(Math.max(0, price)),
      bonus_minutes: bonus.minutes,
      bonus_grant_id: bonus.grantId,
      billed_at: new Date().toISOString(),
      billing_note: notes.length ? notes.join("; ") : null,
    })
    .eq("id", callId);
  if (error) console.error("Billing: failed to store call cost", { callId, error: error.message });
}

// "YYYY-MM-01" for the UTC month containing `date`.
export function monthStart(date: Date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

// Accepts "YYYY-MM"; anything else means the current month.
export function parseMonth(value: string | null | undefined): string {
  return value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? `${value}-01` : monthStart();
}

export type MonthSpend = {
  callsCost: number;
  callsPrice: number;
  numbersCost: number;
  numbersPrice: number;
  voicePrice: number;
  totalCost: number;
  totalPrice: number;
};

export async function monthSpend(orgId: string, month: string = monthStart()): Promise<MonthSpend> {
  const { data, error } = await supabaseServiceClient.rpc("org_month_spend", { p_org: orgId, p_month: month });
  if (error) throw new Error(`Couldn't read this month's spend: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) || {};
  return {
    callsCost: Number(row.calls_cost) || 0,
    callsPrice: Number(row.calls_price) || 0,
    numbersCost: Number(row.numbers_cost) || 0,
    numbersPrice: Number(row.numbers_price) || 0,
    voicePrice: Number(row.voice_price) || 0,
    totalCost: Number(row.total_cost) || 0,
    totalPrice: Number(row.total_price) || 0,
  };
}

const nextMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return monthStart(new Date(Date.UTC(y, m, 1)));
};

// Free credit, month by month from the month the first credit was given:
// each month's charges are paid from the credit active in it (the grant
// ending soonest first) and what's left carries over. Returns what was
// applied in `month`, and each credit grant's balance after that month.
export async function creditForMonth(
  orgId: string,
  month: string = monthStart(),
  spendOfMonth?: MonthSpend
): Promise<{ applied: number; remainingByGrant: Map<string, number>; grants: Grant[] }> {
  const grants = await loadGrants(orgId, "credit");
  const remaining = new Map(grants.map((g) => [g.id, g.amount_usd || 0]));
  if (!grants.length) return { applied: 0, remainingByGrant: remaining, grants };

  let cursor = monthStart(new Date(Math.min(...grants.map((g) => Date.parse(g.starts_at)))));
  let applied = 0;
  while (cursor <= month) {
    const start = Date.parse(`${cursor}T00:00:00Z`);
    const end = Date.parse(`${nextMonth(cursor)}T00:00:00Z`);
    const usable = grants
      .filter((g) => {
        const ends = grantEnd(g);
        return Date.parse(g.starts_at) < end && (ends === null || ends > start) && (remaining.get(g.id) || 0) > 0;
      })
      .sort(bySoonestEnd);

    if (usable.length) {
      const charges =
        cursor === month && spendOfMonth ? spendOfMonth.totalPrice : (await monthSpend(orgId, cursor)).totalPrice;
      let due = charges;
      for (const grant of usable) {
        const take = Math.min(due, remaining.get(grant.id) || 0);
        remaining.set(grant.id, (remaining.get(grant.id) || 0) - take);
        due -= take;
        if (due <= 0) break;
      }
      if (cursor === month) applied = charges - due;
    }
    cursor = nextMonth(cursor);
  }
  return { applied, remainingByGrant: remaining, grants };
}

// What the organization actually pays for a month: its charges minus the free
// credit applied to them. Budgets and statements use this.
export async function monthNet(
  orgId: string,
  month: string = monthStart()
): Promise<{ spend: MonthSpend; creditApplied: number; net: number }> {
  const spend = await monthSpend(orgId, month);
  const { applied } = await creditForMonth(orgId, month, spend);
  return { spend, creditApplied: applied, net: Math.max(0, spend.totalPrice - applied) };
}

export type GrantSummary = {
  id: string;
  kind: "credit" | "minutes";
  amountUsd: number | null;
  minutes: number | null;
  countryCode: string | null;
  // Credit dollars or bonus minutes not used yet.
  left: number;
  status: GrantStatus;
  startsAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  note: string | null;
  createdBy: string;
  createdAt: string;
};

// Every credit and bonus-minutes grant with what's left of it today.
export async function describeGrants(orgId: string): Promise<GrantSummary[]> {
  const [{ remainingByGrant, grants: credits }, minuteGrants] = await Promise.all([
    creditForMonth(orgId),
    loadGrants(orgId, "minutes"),
  ]);
  const used = await bonusMinutesUsed(minuteGrants.map((g) => g.id));

  return [...credits, ...minuteGrants]
    .map((g) => {
      const left =
        g.kind === "credit"
          ? Math.round((remainingByGrant.get(g.id) ?? g.amount_usd ?? 0) * 100) / 100
          : Math.max(0, (g.minutes || 0) - (used.get(g.id) || 0));
      return {
        id: g.id,
        kind: g.kind,
        amountUsd: g.amount_usd,
        minutes: g.minutes,
        countryCode: g.country_code,
        left,
        status: grantStatus(g, left),
        startsAt: g.starts_at,
        expiresAt: g.expires_at,
        revokedAt: g.revoked_at,
        note: g.note,
        createdBy: g.created_by,
        createdAt: g.created_at,
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// Calls of this organization that are still going. Rows older than 2 hours
// don't count, so a call whose final webhook was lost can't block calling
// for good. A browser call that Telnyx never started (no call id linked
// within 2 minutes) never connected and doesn't count either.
export async function countLiveCalls(orgId: string): Promise<number> {
  const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseServiceClient
    .from("calls")
    .select("mode, twilio_call_sid, created_at")
    .eq("org_id", orgId)
    .is("ended_at", null)
    .gte("created_at", since);
  if (error) throw new Error(`Couldn't count calls in progress: ${error.message}`);

  const unlinkedCutoff = Date.now() - 2 * 60 * 1000;
  return (data || []).filter(
    (c: any) => c.mode === "phone" || c.twilio_call_sid || new Date(c.created_at).getTime() > unlinkedCutoff
  ).length;
}

export const money = (n: number) => `$${n.toFixed(2)}`;

// The organization's limits, checked before every call. Returns the message
// to show the agent, or null if the call may go ahead. A call already in
// progress is never cut off.
export async function checkCallAllowed(org: Organization, leadPhone: string): Promise<string | null> {
  const allowed = org.allowed_country_codes;
  if (allowed && allowed.length) {
    const rate = await findRate(leadPhone);
    const country = rate?.country_code ?? countryOf(phoneDigits(leadPhone));
    if (!country || !allowed.includes(country)) {
      return `Calls to ${countryName(country)} aren't allowed for your organization.`;
    }
  }

  if (org.monthly_budget_usd != null) {
    const budget = Number(org.monthly_budget_usd);
    // What they actually pay: free credit doesn't use up the budget.
    const { net } = await monthNet(org.id);
    if (net >= budget) {
      return `Your organization has used its ${money(budget)} budget for this month, so calls are paused until it's raised or the next month starts.`;
    }
  }

  if (org.max_concurrent_calls != null) {
    const live = await countLiveCalls(org.id);
    if (live >= org.max_concurrent_calls) {
      return org.max_concurrent_calls === 0
        ? "Calling is turned off for your organization."
        : `Your organization's ${org.max_concurrent_calls} simultaneous ${
            org.max_concurrent_calls === 1 ? "call is" : "calls are"
          } in use. Try again when a call ends.`;
    }
  }

  return null;
}

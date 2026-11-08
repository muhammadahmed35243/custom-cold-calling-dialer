import { parsePhoneNumberFromString } from "libphonenumber-js";
import { supabaseServiceClient } from "./supabase";
import type { Organization } from "./authz";

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
      "id, mode, caller_id_number, agent_phone_number, agent_leg_seconds, lead_leg_seconds, leads(phone), organizations(call_markup_pct)"
    )
    .eq("id", callId)
    .maybeSingle();
  if (!call) return;

  const lead = one(call.leads as { phone: string } | { phone: string }[] | null);
  const org = one(call.organizations as { call_markup_pct: number } | { call_markup_pct: number }[] | null);
  const notes: string[] = [];
  let cost = 0;

  if ((call.lead_leg_seconds ?? 0) > 0) {
    const rate = await findRate(lead?.phone, call.caller_id_number);
    if (rate) cost += legCost(call.lead_leg_seconds, rate);
    else notes.push("No Telnyx rate for the lead's number");
  }

  // Phone-bridge calls also pay for Telnyx ringing the agent's own phone.
  if (call.mode === "phone" && (call.agent_leg_seconds ?? 0) > 0) {
    const rate = await findRate(call.agent_phone_number, call.caller_id_number);
    if (rate) cost += legCost(call.agent_leg_seconds, rate);
    else notes.push("No Telnyx rate for the agent's phone");
  }

  const { error } = await supabaseServiceClient
    .from("calls")
    .update({
      cost_usd: round6(cost),
      price_usd: round6(withMarkup(cost, org?.call_markup_pct)),
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
    const spend = await monthSpend(org.id);
    if (spend.totalPrice >= budget) {
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

import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import { requireRole, targetOrgId, loadOrganization, canSeeCosts, ADMIN_ROLES } from "@/lib/authz";
import { describeGrants, monthNet, parseMonth, withMarkup } from "@/lib/billing";

const PAGE = 1000;
const MAX_CALLS = 20000;

function one<T>(value: T | T[] | null | undefined): T | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

// One organization's usage and statement for a calendar month (UTC):
// ?month=YYYY-MM (default: this month), and for the super admin ?orgId=.
// Totals come from org_month_spend, the same numbers the budget check uses;
// the lines underneath add up to them. JETZT's costs only go to JETZT.
export async function GET(req: NextRequest) {
  const { actor, error: authError } = await requireRole(req, ADMIN_ROLES);
  if (authError) return authError;

  const orgId = targetOrgId(req, actor);
  const org = orgId === actor.orgId ? actor.org : await loadOrganization(orgId);
  if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

  const month = parseMonth(req.nextUrl.searchParams.get("month"));
  const [year, monthNumber] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, monthNumber - 1, 1)).toISOString();
  const end = new Date(Date.UTC(year, monthNumber, 1)).toISOString();
  const showCost = canSeeCosts(actor);

  try {
    const [{ spend, creditApplied, net }, grants] = await Promise.all([monthNet(org.id, month), describeGrants(org.id)]);

    // Calls, in pages (the API returns at most 1000 rows at a time).
    const calls: any[] = [];
    for (let from = 0; from < MAX_CALLS; from += PAGE) {
      const { data, error } = await supabaseServiceClient
        .from("calls")
        .select(
          "id, created_at, agent_email, mode, duration_seconds, lead_leg_seconds, agent_leg_seconds, cost_usd, price_usd, bonus_minutes, billing_note, leads(name, phone)"
        )
        .eq("org_id", org.id)
        .gte("created_at", start)
        .lt("created_at", end)
        .order("created_at", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      calls.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }

    const { data: numbers, error: numbersError } = await supabaseServiceClient
      .from("phone_numbers")
      .select("phone_number, purchased_at, released_at, monthly_cost, upfront_cost, monthly_price, upfront_price")
      .eq("org_id", org.id)
      .lt("purchased_at", end)
      .or(`released_at.is.null,released_at.gte."${start}"`)
      .order("purchased_at", { ascending: true });
    if (numbersError) throw new Error(numbersError.message);

    const { data: voiceCalls, error: voiceError } = await supabaseServiceClient
      .from("voice_agent_calls")
      .select("started_at, ended_at")
      .eq("org_id", org.id)
      .gte("started_at", start)
      .lt("started_at", end);
    if (voiceError) throw new Error(voiceError.message);

    const voiceMinutes = (voiceCalls || []).reduce((sum: number, v: any) => {
      const ms = Date.parse(v.ended_at) - Date.parse(v.started_at);
      return Number.isFinite(ms) && ms > 0 ? sum + Math.ceil(ms / 60000) : sum;
    }, 0);

    const talkSeconds = (c: any) => c.lead_leg_seconds ?? c.duration_seconds ?? 0;

    return NextResponse.json({
      month: month.slice(0, 7),
      org: {
        id: org.id,
        name: org.name,
        budgetUsd: org.monthly_budget_usd != null ? Number(org.monthly_budget_usd) : null,
        voicePricePerMin: Number(org.voice_assistant_price_per_min) || 0,
        ...(showCost ? { callMarkupPct: Number(org.call_markup_pct), numberMarkupPct: Number(org.number_markup_pct) } : {}),
      },
      spend: {
        ...(showCost
          ? spend
          : {
              callsPrice: spend.callsPrice,
              numbersPrice: spend.numbersPrice,
              voicePrice: spend.voicePrice,
              totalPrice: spend.totalPrice,
            }),
        // Free credit applied to this month's charges, and what's left to pay.
        creditApplied,
        netPrice: net,
      },
      // Free credit and bonus minutes JETZT has given, with what's left today.
      grants: grants.map((g) => {
        if (showCost) return g;
        const visible: Record<string, unknown> = { ...g };
        delete visible.createdBy;
        return visible;
      }),
      stats: {
        calls: calls.length,
        connected: calls.filter((c) => talkSeconds(c) > 0).length,
        talkSeconds: calls.reduce((sum, c) => sum + talkSeconds(c), 0),
        numbers: (numbers || []).length,
        voiceMinutes,
        truncated: calls.length >= MAX_CALLS,
      },
      calls: calls.map((c) => {
        const lead = one(c.leads as { name: string; phone: string } | null);
        return {
          id: c.id,
          createdAt: c.created_at,
          agentEmail: c.agent_email,
          leadName: lead?.name ?? null,
          leadPhone: lead?.phone ?? null,
          mode: c.mode,
          talkSeconds: talkSeconds(c),
          agentLegSeconds: c.agent_leg_seconds,
          priceUsd: c.price_usd != null ? Number(c.price_usd) : null,
          bonusMinutes: c.bonus_minutes || 0,
          ...(showCost ? { costUsd: c.cost_usd != null ? Number(c.cost_usd) : null, note: c.billing_note } : {}),
        };
      }),
      numbers: (numbers || []).map((n: any) => {
        const boughtThisMonth = Date.parse(n.purchased_at) >= Date.parse(start);
        const monthlyPrice =
          n.monthly_price != null
            ? Number(n.monthly_price)
            : n.monthly_cost != null
              ? withMarkup(Number(n.monthly_cost), org.number_markup_pct)
              : 0;
        const upfrontPrice = !boughtThisMonth
          ? 0
          : n.upfront_price != null
            ? Number(n.upfront_price)
            : n.upfront_cost != null
              ? withMarkup(Number(n.upfront_cost), org.number_markup_pct)
              : 0;
        return {
          phoneNumber: n.phone_number,
          purchasedAt: n.purchased_at,
          releasedAt: n.released_at,
          monthlyPrice,
          upfrontPrice,
          ...(showCost
            ? {
                monthlyCost: Number(n.monthly_cost) || 0,
                upfrontCost: boughtThisMonth ? Number(n.upfront_cost) || 0 : 0,
              }
            : {}),
        };
      }),
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Couldn't load usage: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import { requireRole, loadOrganization } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { describeGrants } from "@/lib/billing";
import { cleanLine } from "@/lib/contact";

// GET: every free credit and bonus-minutes grant this organization has, with
// what's left of each today.
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { error: authError } = await requireRole(req, ["super_admin"]);
  if (authError) return authError;

  try {
    return NextResponse.json({ grants: await describeGrants(params.id) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

// POST { kind: "credit", amountUsd } or { kind: "minutes", minutes, countryCode? },
// plus optional expiresOn (YYYY-MM-DD, last day it can be used) and note.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { actor, error: authError } = await requireRole(req, ["super_admin"]);
  if (authError) return authError;

  const org = await loadOrganization(params.id);
  if (!org) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const kind = body.kind;
  const note = cleanLine(body.note, 200) || null;
  const row: Record<string, unknown> = { org_id: org.id, kind, note, created_by: actor.email };

  if (kind === "credit") {
    const amount = Math.round(Number(body.amountUsd) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) {
      return NextResponse.json({ error: "Enter a credit amount between $0.01 and $100,000" }, { status: 400 });
    }
    row.amount_usd = amount;
  } else if (kind === "minutes") {
    const minutes = Number(body.minutes);
    if (!Number.isInteger(minutes) || minutes <= 0 || minutes > 1000000) {
      return NextResponse.json({ error: "Enter a whole number of minutes" }, { status: 400 });
    }
    const country = String(body.countryCode || "").trim().toUpperCase();
    if (country && !/^[A-Z]{2}$/.test(country)) {
      return NextResponse.json({ error: "Country must be a 2-letter code, like PK or US" }, { status: 400 });
    }
    row.minutes = minutes;
    row.country_code = country || null;
  } else {
    return NextResponse.json({ error: "Choose free credit or bonus minutes" }, { status: 400 });
  }

  if (body.expiresOn) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.expiresOn))) {
      return NextResponse.json({ error: "Expiry date doesn't look right" }, { status: 400 });
    }
    // Usable through the whole of that day (UTC).
    const expiresAt = new Date(`${body.expiresOn}T23:59:59.999Z`);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      return NextResponse.json({ error: "Expiry date must be in the future" }, { status: 400 });
    }
    row.expires_at = expiresAt.toISOString();
  }

  const { data, error } = await supabaseServiceClient.from("org_grants").insert([row]).select("id").single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message || "Couldn't save it" }, { status: 500 });
  }

  await logAudit(actor, org.id, kind === "credit" ? "grant.credit_given" : "grant.minutes_given", {
    grant_id: data.id,
    amount_usd: row.amount_usd ?? null,
    minutes: row.minutes ?? null,
    country_code: row.country_code ?? null,
    expires_at: row.expires_at ?? null,
    note,
  });

  return NextResponse.json({ grants: await describeGrants(org.id) });
}

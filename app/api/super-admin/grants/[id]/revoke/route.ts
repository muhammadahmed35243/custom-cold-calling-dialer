import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import { requireRole } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { describeGrants } from "@/lib/billing";

// Stops a free credit or bonus-minutes grant from now on. Whatever was
// already used stays used, so past statements don't change.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { actor, error: authError } = await requireRole(req, ["super_admin"]);
  if (authError) return authError;

  const { data: grant, error } = await supabaseServiceClient
    .from("org_grants")
    .update({ revoked_at: new Date().toISOString(), revoked_by: actor.email })
    .eq("id", params.id)
    .is("revoked_at", null)
    .select("id, org_id, kind, amount_usd, minutes, country_code")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!grant) return NextResponse.json({ error: "Not found, or already revoked" }, { status: 404 });

  await logAudit(actor, grant.org_id, "grant.revoked", {
    grant_id: grant.id,
    kind: grant.kind,
    amount_usd: grant.amount_usd,
    minutes: grant.minutes,
    country_code: grant.country_code,
  });

  return NextResponse.json({ grants: await describeGrants(grant.org_id) });
}

import { NextRequest, NextResponse } from "next/server";
import { getActor } from "@/lib/authz";
import { isAdminRole } from "@/lib/roles";
import { releaseStuckLeads } from "@/lib/leads";

// Safety net the dialer runs when it opens: releases leads still "in
// progress" whose call has ended or gone stale (its end never reached us).
// Agents release their own; admins their organization's.
export async function POST(req: NextRequest) {
  const { actor, error: authError } = await getActor(req);
  if (authError) return authError;

  try {
    const released = await releaseStuckLeads(actor.orgId, isAdminRole(actor.role) ? undefined : actor.email);
    return NextResponse.json({ released });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

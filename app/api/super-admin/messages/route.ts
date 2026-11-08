import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import { requireRole } from "@/lib/authz";

const STATUSES = ["new", "in_progress", "resolved"];

// Every message sent to JETZT, newest first (?status= to filter), and how
// many are still new.
export async function GET(req: NextRequest) {
  const { error: authError } = await requireRole(req, ["super_admin"]);
  if (authError) return authError;

  const status = req.nextUrl.searchParams.get("status");
  let query = supabaseServiceClient
    .from("contact_messages")
    .select(
      "id, created_at, updated_at, source, org_id, sender_email, sender_name, company, phone, category, subject, message, status, email_notified, organizations(name)"
    )
    .order("created_at", { ascending: false })
    .limit(200);
  if (status && STATUSES.includes(status)) query = query.eq("status", status);

  const [{ data, error }, newCount] = await Promise.all([
    query,
    supabaseServiceClient.from("contact_messages").select("id", { count: "exact", head: true }).eq("status", "new"),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const messages = (data || []).map((m: any) => {
    const org = Array.isArray(m.organizations) ? m.organizations[0] : m.organizations;
    const row = { ...m, orgName: org?.name ?? null };
    delete row.organizations;
    return row;
  });

  return NextResponse.json({ messages, newCount: newCount.count ?? 0 });
}

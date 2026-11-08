import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import { requireRole } from "@/lib/authz";

const STATUSES = ["new", "in_progress", "resolved"];

// PATCH { status }: marks a message new, in progress or resolved. Sub admins
// see the same status on their own messages.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { error: authError } = await requireRole(req, ["super_admin"]);
  if (authError) return authError;

  const { status } = await req.json().catch(() => ({}));
  if (!STATUSES.includes(status)) {
    return NextResponse.json({ error: "Unknown status" }, { status: 400 });
  }

  const { data, error } = await supabaseServiceClient
    .from("contact_messages")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", params.id)
    .select("id, status, updated_at")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Message not found" }, { status: 404 });
  return NextResponse.json({ message: data });
}

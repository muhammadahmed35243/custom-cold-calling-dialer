import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import { getAuthenticatedUser } from "@/lib/api-auth";

async function requireAdmin(req: NextRequest) {
  const { user } = await getAuthenticatedUser(req);
  if (!user?.email) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: requester } = await supabaseServiceClient
    .from("agents")
    .select("role")
    .eq("email", user.email)
    .single();

  if (requester?.role !== "admin") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { email: user.email };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const { is_active } = await req.json();

  const { error } = await supabaseServiceClient
    .from("agents")
    .update({ is_active })
    .eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const { error } = await supabaseServiceClient
    .from("agents")
    .delete()
    .eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

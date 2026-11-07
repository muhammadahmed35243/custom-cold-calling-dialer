import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/voice-agent/admin-auth";
import { validateAndFormatPhone } from "@/lib/phone";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const { data, error } = await supabaseServiceClient
    .from("agents")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ agents: data });
}

// Agents are created here rather than from the browser so the role can't be
// chosen by the caller -- new agents are always plain agents.
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const { email, display_name, phone_number, alias_email } = await req.json();
  if (!email || !display_name) {
    return NextResponse.json({ error: "Email and name are required" }, { status: 400 });
  }

  let formattedPhone: string | null = null;
  if (phone_number) {
    const phoneResult = validateAndFormatPhone(phone_number);
    if (!phoneResult.valid || !phoneResult.formatted) {
      return NextResponse.json({ error: phoneResult.error || "Invalid phone number" }, { status: 400 });
    }
    formattedPhone = phoneResult.formatted;
  }

  const { data, error } = await supabaseServiceClient
    .from("agents")
    .insert([
      {
        email: String(email).trim().toLowerCase(),
        display_name: String(display_name).trim(),
        phone_number: formattedPhone,
        alias_email: alias_email ? String(alias_email).trim() : null,
        role: "agent",
        is_active: true,
      },
    ])
    .select()
    .single();

  if (error) {
    const status = error.code === "23505" ? 409 : 500;
    const message = error.code === "23505" ? "An agent with that email already exists" : error.message;
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({ agent: data });
}

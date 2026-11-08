import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import { requireRole, ADMIN_ROLES } from "@/lib/authz";
import {
  cleanBlock,
  cleanLine,
  countMessages,
  notifySuperAdmin,
  SUPPORT_CATEGORIES,
  type SupportCategory,
} from "@/lib/contact";

// An organization's messages to JETZT from the admin portal: change
// requests, problems, billing questions.

// GET: this organization's messages and where each one stands.
export async function GET(req: NextRequest) {
  const { actor, error: authError } = await requireRole(req, ADMIN_ROLES);
  if (authError) return authError;

  const { data, error } = await supabaseServiceClient
    .from("contact_messages")
    .select("id, created_at, category, subject, message, status, sender_email")
    .eq("source", "admin")
    .eq("org_id", actor.orgId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ messages: data });
}

// POST { category, subject, message }: sends a message to JETZT.
export async function POST(req: NextRequest) {
  const { actor, error: authError } = await requireRole(req, ["admin"]);
  if (authError) return authError;

  const body = await req.json().catch(() => ({}));
  const category = String(body.category || "") as SupportCategory;
  const subject = cleanLine(body.subject, 150);
  const message = cleanBlock(body.message, 5000);

  if (!(category in SUPPORT_CATEGORIES)) {
    return NextResponse.json({ error: "Choose what your message is about" }, { status: 400 });
  }
  if (!subject) return NextResponse.json({ error: "Add a short subject" }, { status: 400 });
  if (message.length < 5) return NextResponse.json({ error: "Write your message" }, { status: 400 });

  try {
    const sentToday = await countMessages({
      source: "admin",
      orgId: actor.orgId,
      since: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });
    if (sentToday >= 20) {
      return NextResponse.json(
        { error: "Your organization has sent 20 messages today. Please email support@thejetzt.com instead." },
        { status: 429 }
      );
    }

    const { data: me } = await supabaseServiceClient
      .from("agents")
      .select("display_name")
      .eq("id", actor.agentId)
      .maybeSingle();

    const { data: saved, error } = await supabaseServiceClient
      .from("contact_messages")
      .insert([
        {
          source: "admin",
          org_id: actor.orgId,
          sender_email: actor.email,
          sender_name: me?.display_name || null,
          category,
          subject,
          message,
        },
      ])
      .select("id, created_at, category, subject, message, status, sender_email")
      .single();
    if (error || !saved) throw new Error(error?.message || "insert failed");

    await notifySuperAdmin({
      id: saved.id,
      source: "admin",
      senderName: me?.display_name || null,
      senderEmail: actor.email,
      orgName: actor.org.name,
      category,
      subject,
      message,
    });

    return NextResponse.json({ message: saved });
  } catch (err) {
    console.error("support: couldn't save a message", err);
    return NextResponse.json(
      { error: "Sorry, your message couldn't be sent. Please email support@thejetzt.com." },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/voice-agent/admin-auth";
import { embedText } from "@/lib/voice-agent/embeddings";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const { data, error } = await supabaseServiceClient
    .from("knowledge_base")
    .select("id, content, source, created_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entries: data });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const { content } = await req.json();
  if (!content?.trim()) {
    return NextResponse.json({ error: "Content is required" }, { status: 400 });
  }

  let embedding: number[];
  try {
    embedding = await embedText(content);
  } catch (err) {
    return NextResponse.json(
      { error: `Embedding failed: ${err instanceof Error ? err.message : "unknown error"}` },
      { status: 500 }
    );
  }

  const { error } = await supabaseServiceClient
    .from("knowledge_base")
    .insert({ content, embedding, source: "admin_portal" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

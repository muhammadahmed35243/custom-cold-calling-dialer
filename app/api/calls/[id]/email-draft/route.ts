import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import { getAuthenticatedUser } from "@/lib/api-auth";

const MAX_TRANSCRIPT_CHARS = 12000;

type Utterance = { speaker: "Agent" | "Lead"; startSeconds: number; text: string };

function transcriptToText(transcript: Utterance[] | null) {
  if (!transcript?.length) return "";
  const text = transcript.map((u) => `${u.speaker}: ${u.text}`).join("\n");
  return text.length > MAX_TRANSCRIPT_CHARS ? text.slice(-MAX_TRANSCRIPT_CHARS) : text;
}

// Drafts a follow-up email grounded in what actually happened on this call
// (notes, disposition, transcript) rather than a fixed template.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { user } = await getAuthenticatedUser(req);
  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: call } = await supabaseServiceClient
    .from("calls")
    .select("disposition, notes, transcript, transcript_status, leads(name, company)")
    .eq("id", params.id)
    .eq("agent_email", user.email)
    .single();

  if (!call) {
    return NextResponse.json({ error: "Call not found" }, { status: 404 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not configured" }, { status: 500 });
  }

  const lead = Array.isArray(call.leads) ? call.leads[0] : call.leads;
  const transcript = transcriptToText(call.transcript as Utterance[] | null);

  const context = [
    `Lead name: ${lead?.name || "unknown"}`,
    lead?.company ? `Company: ${lead.company}` : null,
    call.disposition ? `Call outcome: ${call.disposition}` : null,
    call.notes ? `Agent's notes from the call:\n${call.notes}` : null,
    transcript ? `Call transcript:\n${transcript}` : null,
  ].filter(Boolean).join("\n\n");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You write short, warm follow-up sales emails from a salesperson at JETZT to a prospect after a phone call. " +
            "When a transcript is provided, base the email on it: recap what the prospect actually said (their needs, objections, " +
            "questions, and anything the agent promised to send or do), and make the next step match what was agreed on the call. " +
            "Otherwise use the agent's notes and call outcome. Write a subject specific to this conversation, not a generic one. " +
            "Keep it under 150 words, plain and human, with one clear next step. Do not invent facts that aren't in the context. " +
            "Respond with JSON: {\"subject\": string, \"body\": string}. End the body with a sign-off line of 'JETZT'.",
        },
        { role: "user", content: context },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return NextResponse.json(
      { error: `Draft generation failed (${res.status}): ${body.slice(0, 200)}` },
      { status: 502 }
    );
  }

  let parsed: { subject?: unknown; body?: unknown };
  try {
    const completion = await res.json();
    parsed = JSON.parse(completion.choices[0].message.content);
  } catch (err) {
    console.error("email-draft: unparseable model response", err);
    return NextResponse.json({ error: "AI returned an unreadable draft, try again" }, { status: 502 });
  }
  if (typeof parsed.subject !== "string" || typeof parsed.body !== "string") {
    return NextResponse.json({ error: "AI returned an incomplete draft, try again" }, { status: 502 });
  }

  return NextResponse.json({
    subject: parsed.subject,
    body: parsed.body,
    // Lets the UI say whether the draft came from the transcript or only notes.
    usedTranscript: Boolean(transcript),
    transcriptStatus: call.transcript_status ?? null,
  });
}

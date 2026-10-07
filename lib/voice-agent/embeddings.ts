import OpenAI from "openai";

// Created on first use: the OpenAI constructor throws without an API key,
// which at module load fails `next build` wherever OPENAI_API_KEY isn't set
// (e.g. Vercel Preview).
let openai: OpenAI | null = null;
function getOpenAI() {
  if (!openai) openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openai;
}

// Same model as jetzt-voice-agent's src/agent/embeddings.ts — has to match,
// since knowledge_base.embedding is a fixed vector(1536) column sized for
// text-embedding-3-small specifically.
export async function embedText(text: string): Promise<number[]> {
  const res = await getOpenAI().embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return res.data[0].embedding;
}

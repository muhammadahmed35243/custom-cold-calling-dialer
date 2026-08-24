import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Same model as jetzt-voice-agent's src/agent/embeddings.ts — has to match,
// since knowledge_base.embedding is a fixed vector(1536) column sized for
// text-embedding-3-small specifically.
export async function embedText(text: string): Promise<number[]> {
  const res = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return res.data[0].embedding;
}

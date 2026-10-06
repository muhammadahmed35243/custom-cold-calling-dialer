import ffmpegPath from "ffmpeg-static";
import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtemp, writeFile, readdir, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { supabaseServiceClient } from "./supabase";

const execFileAsync = promisify(execFile);

const CHUNK_SECONDS = 30;
const TRANSCRIBE_CONCURRENCY = 6;

// Telnyx records the two legs as left/right channels. Which side is the
// agent is verified against a real recording -- flip this if the labels come
// out swapped.
const AGENT_CHANNEL: "left" | "right" = "left";

export type Utterance = {
  speaker: "Agent" | "Lead";
  startSeconds: number;
  text: string;
};

async function splitChannelsIntoChunks(input: string, dir: string) {
  if (!ffmpegPath) throw new Error("ffmpeg binary is not available");
  const segmentArgs = (out: string) => [
    "-f", "segment", "-segment_time", String(CHUNK_SECONDS),
    "-c:a", "libmp3lame", "-b:a", "64k", out,
  ];
  await execFileAsync(ffmpegPath, [
    "-y", "-i", input,
    "-filter_complex", "[0:a]channelsplit=channel_layout=stereo[left][right]",
    "-map", "[left]", ...segmentArgs(path.join(dir, "left_%03d.mp3")),
    "-map", "[right]", ...segmentArgs(path.join(dir, "right_%03d.mp3")),
  ]);
}

async function transcribeChunk(audio: Buffer, filename: string): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(audio)], { type: "audio/mpeg" }), filename);
  form.append("model", "gpt-4o-transcribe");
  form.append("response_format", "text");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
  });

  const body = await res.text();
  if (!res.ok) {
    throw new Error(`OpenAI transcription failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return body.trim();
}

async function transcribeAll(jobs: { file: string; speaker: Utterance["speaker"]; index: number }[], dir: string) {
  const utterances: Utterance[] = [];
  for (let i = 0; i < jobs.length; i += TRANSCRIBE_CONCURRENCY) {
    const batch = jobs.slice(i, i + TRANSCRIBE_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (job) => {
        const audio = await readFile(path.join(dir, job.file));
        const text = await transcribeChunk(audio, job.file);
        return { speaker: job.speaker, startSeconds: job.index * CHUNK_SECONDS, text };
      })
    );
    utterances.push(...results.filter((u) => u.text));
  }
  return utterances;
}

// Splits the call's dual-channel recording into per-speaker 30s chunks,
// transcribes each one, and merges them into a single timeline ordered by
// start time. The transcript is stored on the call row; a failure marks it
// failed rather than throwing into the recording webhook.
export async function transcribeCallRecording(callId: string, storagePath: string) {
  await supabaseServiceClient
    .from("calls")
    .update({ transcript_status: "pending" })
    .eq("id", callId);

  const dir = await mkdtemp(path.join(tmpdir(), "call-transcript-"));
  try {
    const { data, error } = await supabaseServiceClient.storage
      .from("recordings")
      .download(storagePath);
    if (error || !data) throw new Error(`Recording download failed: ${error?.message}`);

    const input = path.join(dir, "recording.mp3");
    await writeFile(input, Buffer.from(await data.arrayBuffer()));
    await splitChannelsIntoChunks(input, dir);

    const files = (await readdir(dir)).filter((f) => /^(left|right)_\d+\.mp3$/.test(f)).sort();
    const jobs = files.map((file) => {
      const [, channel, index] = file.match(/^(left|right)_(\d+)\.mp3$/)!;
      const speaker: Utterance["speaker"] = channel === AGENT_CHANNEL ? "Agent" : "Lead";
      return { file, speaker, index: parseInt(index, 10) };
    });

    const utterances = await transcribeAll(jobs, dir);
    utterances.sort((a, b) => a.startSeconds - b.startSeconds || (a.speaker === "Agent" ? -1 : 1));

    await supabaseServiceClient
      .from("calls")
      .update({ transcript: utterances, transcript_status: "ready" })
      .eq("id", callId);
  } catch (err) {
    await supabaseServiceClient
      .from("calls")
      .update({ transcript_status: "failed" })
      .eq("id", callId);
    console.error("Transcription failed:", err);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

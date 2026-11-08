import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import { cleanBlock, cleanLine, countMessages, EMAIL_PATTERN, hashIp, notifySuperAdmin } from "@/lib/contact";

const FALLBACK = "Please email us at contact@thejetzt.com instead.";

function reply(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

// The contact form on the public homepage. Anyone can post, so it's guarded
// against spam: a hidden field and a minimum fill-in time catch simple bots
// (they get a quiet "success"), and each IP address -- stored only as a
// one-way hash -- and the form as a whole have send limits.
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return reply(400, "Invalid request");
  }

  const elapsedMs = Number(body.elapsedMs);
  if (cleanLine(body.website, 200) || (Number.isFinite(elapsedMs) && elapsedMs < 2500)) {
    return NextResponse.json({ success: true });
  }

  const name = cleanLine(body.name, 100);
  const email = cleanLine(body.email, 200).toLowerCase();
  const company = cleanLine(body.company, 120);
  const phone = cleanLine(body.phone, 40);
  const message = cleanBlock(body.message, 5000);

  if (!name) return reply(400, "Please add your name.");
  if (!EMAIL_PATTERN.test(email)) return reply(400, "Please add a valid email address.");
  if (message.length < 10) return reply(400, "Please tell us a little more in your message.");

  const ipHash = hashIp(req);
  const minutesAgo = (m: number) => new Date(Date.now() - m * 60 * 1000);

  try {
    if (ipHash) {
      const recent = await countMessages({ source: "website", ipHash, since: minutesAgo(10) });
      const today = await countMessages({ source: "website", ipHash, since: minutesAgo(24 * 60) });
      if (recent >= 3 || today >= 10) {
        return reply(429, `You've sent us several messages already, and we'll be in touch. ${FALLBACK}`);
      }
    }
    if ((await countMessages({ source: "website", since: minutesAgo(60) })) >= 30) {
      return reply(429, `We're getting a lot of messages right now. ${FALLBACK}`);
    }

    const { data: saved, error } = await supabaseServiceClient
      .from("contact_messages")
      .insert([
        {
          source: "website",
          category: "sales",
          sender_name: name,
          sender_email: email,
          company: company || null,
          phone: phone || null,
          message,
          ip_hash: ipHash,
        },
      ])
      .select("id")
      .single();
    if (error || !saved) throw new Error(error?.message || "insert failed");

    await notifySuperAdmin({
      id: saved.id,
      source: "website",
      senderName: name,
      senderEmail: email,
      company,
      phone,
      category: "sales",
      message,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("contact: couldn't save a website message", err);
    return reply(500, `Sorry, your message couldn't be sent. ${FALLBACK}`);
  }
}

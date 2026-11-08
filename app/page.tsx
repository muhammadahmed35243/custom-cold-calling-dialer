"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabaseAuth } from "@/lib/supabase";
import { useAppReady } from "@/components/AppReadyContext";
import { BrandedLoader } from "@/components/BrandedLoader";
import { JetztLogo } from "@/components/Logo";
import { Avatar } from "@/components/Avatar";
import { StatusBadge } from "@/components/StatusBadge";
import { PhoneIcon, UploadIcon, UsersIcon, CheckCircleIcon } from "@/components/icons";
import { ContactForm } from "@/components/ContactForm";

export const dynamic = "force-dynamic";

export default function Home() {
  const router = useRouter();
  const { setReady } = useAppReady();
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabaseAuth.auth.getUser();
      if (user?.email) {
        router.push("/dashboard");
        setReady();
        return;
      }
      setCheckingAuth(false);
      setReady();
    };
    checkAuth();
  }, [router, setReady]);

  if (checkingAuth) return <BrandedLoader />;

  return <Homepage />;
}

const FEATURES = [
  {
    icon: PhoneIcon,
    title: "Phone or browser calling",
    body: "Agents choose per call: ring your own phone first, or dial straight from the tab using your computer's mic and speaker.",
  },
  {
    icon: UploadIcon,
    title: "Flexible lead upload",
    body: "Drop in a CSV or Excel file. Common header names are recognized automatically, and nothing in the sheet is dropped.",
  },
  {
    icon: UsersIcon,
    title: "Admin oversight",
    body: "Manage agents, assign numbers, and review every call across the team from one dashboard.",
  },
  {
    icon: PhoneIcon,
    title: "Every call recorded",
    body: "Recording is automatic on both calling modes, stored securely and available the moment the call ends.",
  },
];

const INBOUND_POINTS = [
  "Answers every inbound call, day or night",
  "Holds a real conversation, not a phone-tree menu",
  "Every call lands in the same admin dashboard your team already uses",
];

const ASSISTANT_POINTS = [
  "Live call notes, saved automatically as you type",
  "Agent/Lead transcript generated from the recording, no setup",
  "Follow-up email drafted from the call's own notes and transcript",
];

const STEPS = [
  { title: "Upload your leads", body: "Any spreadsheet, any headers. Leads land in a shared queue ready to call." },
  { title: "Call by phone or browser", body: "Agents work the queue one lead at a time, by phone or straight from the browser." },
  { title: "Let AI handle the recap", body: "A transcript and a drafted follow-up email are ready before the next call starts." },
];

function Homepage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-background/75 backdrop-blur-md border-b border-border/70">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <JetztLogo className="h-7 w-auto" />
          <nav className="hidden md:flex items-center gap-1 text-sm" aria-label="Sections">
            <a href="#features" className="btn btn-ghost h-9">Features</a>
            <a href="#how" className="btn btn-ghost h-9">How it works</a>
            <a href="#contact" className="btn btn-ghost h-9">Contact</a>
          </nav>
          <Link
            href="/auth/login"
            className="btn btn-primary"
          >
            Sign In
          </Link>
        </div>
      </header>

      <section className="relative overflow-hidden dotted-bg">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-48 left-1/2 h-[560px] w-[900px] max-w-[160vw] -translate-x-1/2 rounded-full bg-brand/25 blur-3xl"
        />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-20 sm:pb-28 flex flex-col items-center text-center">
          <span className="inline-flex items-center gap-2 text-xs font-medium text-brand-strong bg-card/80 border border-brand/30 shadow-soft px-3 py-1.5 rounded-full mb-6">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden="true" />
            A calling workspace, not just a dialer
          </span>
          <h1 className="w-full text-[2.5rem] leading-[1.08] sm:text-6xl font-semibold tracking-tight text-foreground max-w-4xl">
            The cold-calling workspace built for{" "}
            <span className="relative whitespace-nowrap">
              <span className="relative z-10">outbound teams</span>
              <span aria-hidden="true" className="absolute inset-x-0 bottom-1 sm:bottom-2 h-3 sm:h-4 bg-brand/35 -z-0 rounded-sm" />
            </span>
          </h1>
          <p className="w-full text-base sm:text-lg text-muted-foreground max-w-2xl mt-6 leading-relaxed">
            Phone or browser calling, automatic recording and transcripts, and follow-up emails
            written from what was actually said — all in one place your team already works in.
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-3 mt-8">
            <Link
              href="/auth/login"
              className="btn btn-primary btn-lg w-full sm:w-auto text-center"
            >
              Sign In
            </Link>
            <a
              href="#contact"
              className="btn btn-secondary btn-lg w-full sm:w-auto text-center"
            >
              Talk to us
            </a>
          </div>
          <p className="text-xs text-muted-foreground mt-4">Outbound calling to 220+ countries worldwide</p>

          {/* Illustrative product preview, not real data */}
          <div className="mt-14 sm:mt-16 w-full max-w-3xl bg-card border border-border rounded-2xl shadow-lift p-5 sm:p-6 text-left ring-1 ring-black/[0.02]">
            <div className="flex items-center justify-between mb-5">
              <span className="eyebrow">Active call</span>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-accent-green-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-accent-green animate-pulse" />
                Live
              </span>
            </div>
            <div className="flex items-center gap-4 mb-6">
              <Avatar name="Jordan Lee" size="lg" />
              <div>
                <div className="font-semibold text-foreground">Jordan Lee</div>
                <div className="text-sm text-muted-foreground font-mono">+1 (415) 555-0148</div>
                <div className="text-sm font-medium text-brand-strong mt-1">Connected · 02:14</div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-secondary/70 border border-border rounded-lg p-3">
                <div className="text-xs text-muted-foreground">Pending</div>
                <div className="text-lg font-semibold text-foreground tabular-nums">184</div>
              </div>
              <div className="bg-secondary/70 border border-border rounded-lg p-3">
                <div className="text-xs text-muted-foreground">Called</div>
                <div className="text-lg font-semibold text-foreground tabular-nums">37</div>
              </div>
              <div className="bg-secondary/70 border border-border rounded-lg p-3">
                <div className="text-xs text-muted-foreground">Connected</div>
                <div className="text-lg font-semibold text-foreground tabular-nums">12</div>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Last call: Acme Robotics</span>
              <StatusBadge status="connected" />
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="max-w-6xl mx-auto px-4 sm:px-6 py-20 sm:py-24 scroll-mt-16">
        <div className="text-center max-w-2xl mx-auto mb-12 sm:mb-14">
          <div className="eyebrow mb-3">Features</div>
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">The calling fundamentals, built in</h2>
          <p className="text-muted-foreground mt-3">Everything else below is on top of these.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {FEATURES.map((f) => (
            <div key={f.title} className="card card-hover p-6 hover:-translate-y-0.5 transition-all">
              <div className="h-10 w-10 rounded-lg bg-brand-soft text-brand-strong flex items-center justify-center mb-4">
                <f.icon className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-foreground mb-1.5">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <span className="text-xs font-medium text-brand-strong bg-brand-soft border border-brand/25 px-3 py-1 rounded-full">Inbound, covered</span>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground mt-4">
              An AI voice agent answers when your team can&apos;t
            </h2>
            <p className="text-muted-foreground mt-4 leading-relaxed">
              Inbound calls don&apos;t have to go to voicemail. JETZT&apos;s AI voice agent picks up,
              has a real conversation with the caller, and logs it straight into the same
              admin dashboard your team already uses.
            </p>
            <ul className="mt-6 space-y-3">
              {INBOUND_POINTS.map((point) => (
                <li key={point} className="flex items-start gap-2.5 text-sm text-foreground">
                  <CheckCircleIcon className="w-4 h-4 text-brand-strong shrink-0 mt-0.5" />
                  {point}
                </li>
              ))}
            </ul>
          </div>

          {/* Illustrative, not a real call */}
          <div className="bg-card border border-border rounded-2xl shadow-lift p-5 sm:p-6">
            <div className="flex items-center justify-between mb-5">
              <span className="eyebrow">Incoming call</span>
              <span className="text-xs font-medium text-brand-strong bg-brand/10 px-2 py-0.5 rounded-full">Answered by AI</span>
            </div>
            <div className="flex items-center gap-4 mb-5">
              <Avatar name="Unknown Caller" size="md" />
              <div>
                <div className="font-semibold text-foreground text-sm font-mono">+1 (312) 555-0122</div>
                <div className="text-xs text-muted-foreground">Answered in 2 rings</div>
              </div>
            </div>
            <div className="space-y-2.5 text-sm bg-secondary rounded-lg p-4">
              <div><span className="font-medium text-brand-strong">AI Voice Agent</span> <span className="text-foreground">Thanks for calling JETZT, how can I help today?</span></div>
              <div><span className="font-medium text-foreground">Caller</span> <span className="text-foreground">I&apos;d like a quote for my sales team.</span></div>
              <div><span className="font-medium text-brand-strong">AI Voice Agent</span> <span className="text-foreground">Happy to help, let me grab a few details first.</span></div>
            </div>
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Illustrative, not a real call */}
          <div className="bg-card border border-border rounded-2xl shadow-lift p-5 sm:p-6 space-y-5 order-2 lg:order-1">
            <div>
              <span className="eyebrow">Transcript</span>
              <div className="mt-2.5 space-y-2 text-sm">
                <div>
                  <span className="font-medium text-brand-strong">Agent</span>
                  <span className="text-xs text-muted-foreground font-mono ml-2">0:04</span>
                  <span className="text-foreground ml-2">Hi Jordan, following up on the demo we booked.</span>
                </div>
                <div>
                  <span className="font-medium text-foreground">Lead</span>
                  <span className="text-xs text-muted-foreground font-mono ml-2">0:09</span>
                  <span className="text-foreground ml-2">Yes, Thursday at 2pm still works.</span>
                </div>
              </div>
            </div>
            <div className="pt-4 border-t border-border">
              <span className="eyebrow">Follow-up email &middot; draft</span>
              <div className="mt-2.5 text-sm bg-secondary rounded-lg p-3">
                <div className="font-medium text-foreground mb-1">Confirming our Thursday demo</div>
                <div className="text-muted-foreground">Hi Jordan, great catching up. Confirming Thursday at 2pm for the demo...</div>
              </div>
            </div>
          </div>

          <div className="order-1 lg:order-2">
            <span className="text-xs font-medium text-brand-strong bg-brand-soft border border-brand/25 px-3 py-1 rounded-full">After every call</span>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground mt-4">
              Notes, transcripts, and follow-ups, handled for you
            </h2>
            <p className="text-muted-foreground mt-4 leading-relaxed">
              Jot notes live if you want to, but you don&apos;t have to. Every recorded call is
              split by speaker and transcribed automatically, and a follow-up email is
              drafted from what was actually said, not a generic template.
            </p>
            <ul className="mt-6 space-y-3">
              {ASSISTANT_POINTS.map((point) => (
                <li key={point} className="flex items-start gap-2.5 text-sm text-foreground">
                  <CheckCircleIcon className="w-4 h-4 text-brand-strong shrink-0 mt-0.5" />
                  {point}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section id="how" className="bg-gradient-to-b from-brand-soft/60 to-background border-y border-border scroll-mt-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-20 sm:py-24">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">How it works</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-10">
            {STEPS.map((step, i) => (
              <div key={step.title} className="text-center sm:text-left">
                <div className="h-10 w-10 rounded-full bg-primary text-primary-foreground font-semibold shadow-glow flex items-center justify-center mb-4 mx-auto sm:mx-0">
                  {i + 1}
                </div>
                <h3 className="font-semibold text-foreground mb-1.5">{step.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="contact" className="max-w-6xl mx-auto px-4 sm:px-6 py-24 scroll-mt-16">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-10 items-start">
          <div className="lg:col-span-2 text-center lg:text-left">
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">Ready to call smarter?</h2>
            <p className="text-muted-foreground mt-3">
              Tell us about your team and we&apos;ll get back to you with a setup that fits. Already using JETZT
              Dialer? Sign in to get started.
            </p>
            <div className="mt-8">
              <Link
                href="/auth/login"
                className="btn btn-primary btn-lg w-full sm:w-auto text-center"
              >
                Sign In
              </Link>
            </div>
            <p className="text-sm text-muted-foreground mt-6">
              Prefer email?{" "}
              <a href="mailto:contact@thejetzt.com" className="text-foreground underline underline-offset-2 hover:no-underline">
                contact@thejetzt.com
              </a>
            </p>
          </div>
          <div className="lg:col-span-3">
            <ContactForm />
          </div>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <JetztLogo className="h-6 w-auto" />
            <span className="text-sm text-muted-foreground">Now, not next quarter</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <a href="mailto:contact@thejetzt.com" className="hover:text-foreground transition-colors">contact@thejetzt.com</a>
            <a href="mailto:support@thejetzt.com" className="hover:text-foreground transition-colors">support@thejetzt.com</a>
            <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
            <span>&copy; {new Date().getFullYear()} JETZT</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

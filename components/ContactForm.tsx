"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type Fields = { name: string; email: string; company: string; phone: string; message: string; website: string };

const EMPTY: Fields = { name: "", email: "", company: "", phone: "", message: "", website: "" };

const inputClass =
  "w-full px-3 py-2.5 border border-border rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring";

// The homepage's "get in touch" form. Goes to JETZT's inbox (super admin
// console and email) through /api/contact.
export function ContactForm() {
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // How long the visitor took to fill the form in; instant submissions are bots.
  const shownAt = useRef(0);

  useEffect(() => {
    shownAt.current = Date.now();
  }, []);

  const set = (key: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setFields((prev) => ({ ...prev, [key]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...fields, elapsedMs: Date.now() - shownAt.current }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setSentTo(fields.email.trim());
        setFields(EMPTY);
      } else {
        setError(body.error || "Your message couldn't be sent. Please email contact@thejetzt.com.");
      }
    } catch {
      setError("Your message couldn't be sent. Please email contact@thejetzt.com.");
    } finally {
      setSending(false);
    }
  };

  if (sentTo) {
    return (
      <div role="status" className="bg-card border border-border rounded-2xl shadow-sm p-8 text-left">
        <h3 className="text-lg font-semibold text-foreground">Thanks, we&apos;ve got your message</h3>
        <p className="text-sm text-muted-foreground mt-2">
          We&apos;ll reply to <span className="text-foreground">{sentTo}</span> soon.
        </p>
        <button
          onClick={() => setSentTo(null)}
          className="mt-6 text-sm font-medium text-muted-foreground hover:text-foreground underline underline-offset-2"
        >
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="relative bg-card border border-border rounded-2xl shadow-sm p-6 sm:p-8 text-left space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="contact-name" className="block text-xs font-medium text-muted-foreground mb-1">
            Name
          </label>
          <input id="contact-name" type="text" required maxLength={100} autoComplete="name" value={fields.name} onChange={set("name")} className={inputClass} />
        </div>
        <div>
          <label htmlFor="contact-email" className="block text-xs font-medium text-muted-foreground mb-1">
            Email
          </label>
          <input id="contact-email" type="email" required maxLength={200} autoComplete="email" value={fields.email} onChange={set("email")} className={inputClass} />
        </div>
        <div>
          <label htmlFor="contact-company" className="block text-xs font-medium text-muted-foreground mb-1">
            Company <span className="font-normal">(optional)</span>
          </label>
          <input id="contact-company" type="text" maxLength={120} autoComplete="organization" value={fields.company} onChange={set("company")} className={inputClass} />
        </div>
        <div>
          <label htmlFor="contact-phone" className="block text-xs font-medium text-muted-foreground mb-1">
            Phone <span className="font-normal">(optional)</span>
          </label>
          <input id="contact-phone" type="tel" maxLength={40} autoComplete="tel" value={fields.phone} onChange={set("phone")} className={inputClass} />
        </div>
      </div>

      <div>
        <label htmlFor="contact-message" className="block text-xs font-medium text-muted-foreground mb-1">
          How can we help?
        </label>
        <textarea
          id="contact-message"
          required
          minLength={10}
          maxLength={5000}
          rows={5}
          value={fields.message}
          onChange={set("message")}
          placeholder="Tell us about your team, how many agents and which countries you call."
          className={`${inputClass} resize-y`}
        />
      </div>

      {/* Left empty by people (it's hidden); bots that fill every field get caught. */}
      <div aria-hidden="true" className="absolute -left-[10000px] top-0 h-px w-px overflow-hidden">
        <label htmlFor="contact-website">Website</label>
        <input id="contact-website" type="text" tabIndex={-1} autoComplete="off" value={fields.website} onChange={set("website")} />
      </div>

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">{error}</div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          We use your details only to reply. See our{" "}
          <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">
            Privacy Policy
          </Link>
          .
        </p>
        <button
          type="submit"
          disabled={sending}
          className="bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground font-medium px-6 py-3 rounded-lg text-sm transition-all active:translate-y-px"
        >
          {sending ? "Sending..." : "Send message"}
        </button>
      </div>
    </form>
  );
}

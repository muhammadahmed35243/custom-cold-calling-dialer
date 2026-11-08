"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseAuth } from "@/lib/supabase";
import { AppHeader } from "@/components/AppHeader";
import { useAppReady } from "@/components/AppReadyContext";
import { BrandedLoader } from "@/components/BrandedLoader";
import { authedFetch } from "@/lib/voice-agent/authedFetch";
import { MessagesPanel } from "@/components/super-admin/MessagesPanel";
import { GrantsDialog, countryLabel } from "@/components/super-admin/GrantsDialog";

export const dynamic = "force-dynamic";

type OrgAdmin = { email: string; display_name: string; role: string; is_active: boolean };

type Org = {
  id: string;
  name: string;
  status: "active" | "suspended";
  monthly_budget_usd: number | null;
  call_markup_pct: number;
  number_markup_pct: number;
  max_agents: number | null;
  max_phone_numbers: number | null;
  max_concurrent_calls: number | null;
  allowed_country_codes: string[] | null;
  ai_features_enabled: boolean;
  voice_assistant_enabled: boolean;
  recording_enabled: boolean;
  recording_retention_days: number | null;
  calling_hours_start: number | null;
  calling_hours_end: number | null;
  created_at: string;
  isFounding: boolean;
  admins: OrgAdmin[];
  agentCount: number;
  numberCount: number;
  // This month: what the organization pays (after free credit), what it cost
  // JETZT at Telnyx, the credit applied and the charges before credit.
  monthSpend: { price: number; cost: number; credit?: number; charges?: number } | null;
  // Free credit and bonus minutes still available.
  gifts?: { creditLeft: number; minutesLeft: { countryCode: string | null; minutes: number }[] } | null;
};

// Numbers are kept as strings while editing; empty means "no limit".
type FormState = {
  name: string;
  adminName: string;
  adminEmail: string;
  max_agents: string;
  max_phone_numbers: string;
  max_concurrent_calls: string;
  monthly_budget_usd: string;
  call_markup_pct: string;
  number_markup_pct: string;
  allowed_country_codes: string;
  calling_hours_start: string;
  calling_hours_end: string;
  ai_features_enabled: boolean;
  recording_enabled: boolean;
  recording_retention_days: string;
  voice_assistant_enabled: boolean;
};

// Defaults follow the pricing plan: two agents, one number, 15% on calls and
// a number resold at double its cost.
const NEW_ORG_FORM: FormState = {
  name: "",
  adminName: "",
  adminEmail: "",
  max_agents: "2",
  max_phone_numbers: "1",
  max_concurrent_calls: "2",
  monthly_budget_usd: "",
  call_markup_pct: "15",
  number_markup_pct: "100",
  allowed_country_codes: "",
  calling_hours_start: "",
  calling_hours_end: "",
  ai_features_enabled: true,
  recording_enabled: true,
  recording_retention_days: "",
  voice_assistant_enabled: false,
};

const text = (n: number | null) => (n === null || n === undefined ? "" : String(n));

function formFromOrg(org: Org): FormState {
  return {
    name: org.name,
    adminName: "",
    adminEmail: "",
    max_agents: text(org.max_agents),
    max_phone_numbers: text(org.max_phone_numbers),
    max_concurrent_calls: text(org.max_concurrent_calls),
    monthly_budget_usd: text(org.monthly_budget_usd),
    call_markup_pct: text(org.call_markup_pct),
    number_markup_pct: text(org.number_markup_pct),
    allowed_country_codes: (org.allowed_country_codes || []).join(", "),
    calling_hours_start: text(org.calling_hours_start),
    calling_hours_end: text(org.calling_hours_end),
    ai_features_enabled: org.ai_features_enabled,
    recording_enabled: org.recording_enabled,
    recording_retention_days: text(org.recording_retention_days),
    voice_assistant_enabled: org.voice_assistant_enabled,
  };
}

function payloadFromForm(form: FormState) {
  const num = (s: string) => (s.trim() === "" ? null : Number(s));
  return {
    name: form.name,
    max_agents: num(form.max_agents),
    max_phone_numbers: num(form.max_phone_numbers),
    max_concurrent_calls: num(form.max_concurrent_calls),
    monthly_budget_usd: num(form.monthly_budget_usd),
    call_markup_pct: num(form.call_markup_pct) ?? 0,
    number_markup_pct: num(form.number_markup_pct) ?? 0,
    allowed_country_codes: form.allowed_country_codes,
    calling_hours_start: num(form.calling_hours_start),
    calling_hours_end: num(form.calling_hours_end),
    ai_features_enabled: form.ai_features_enabled,
    recording_enabled: form.recording_enabled,
    recording_retention_days: num(form.recording_retention_days),
    voice_assistant_enabled: form.voice_assistant_enabled,
  };
}

const limit = (used: number, max: number | null) => (max === null ? `${used} (no limit)` : `${used} / ${max}`);
const hour = (h: number) => `${String(h).padStart(2, "0")}:00`;

export default function SuperAdminPage() {
  const router = useRouter();
  const { setReady } = useAppReady();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [error, setError] = useState<string | null>(null);
  // null = closed; "new" = creating; an Org = editing that organization.
  const [editing, setEditing] = useState<Org | "new" | null>(null);
  const [confirmingSuspend, setConfirmingSuspend] = useState<string | null>(null);
  const [busyOrgId, setBusyOrgId] = useState<string | null>(null);
  const [view, setView] = useState<"orgs" | "messages">("orgs");
  const [grantsFor, setGrantsFor] = useState<Org | null>(null);
  const [newMessages, setNewMessages] = useState(0);

  const loadOrgs = useCallback(async () => {
    const res = await authedFetch("/api/super-admin/organizations");
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      setOrgs(body.organizations || []);
      setError(null);
    } else {
      setError(body.error || "Failed to load organizations");
    }
    return res.status;
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { user: authUser } } = await supabaseAuth.auth.getUser();
      if (!authUser?.email) {
        router.push("/auth/login");
        setReady();
        return;
      }
      setUser(authUser);

      const status = await loadOrgs();
      // Only the super admin gets a list; everyone else goes back to their own pages.
      if (status === 401 || status === 403) {
        router.push("/dashboard");
        setReady();
        return;
      }
      // The notification emails link to /super-admin?tab=messages.
      if (new URLSearchParams(window.location.search).get("tab") === "messages") setView("messages");
      // How many messages are waiting, for the tab's badge.
      authedFetch("/api/super-admin/messages?status=new")
        .then((res) => (res.ok ? res.json() : null))
        .then((body) => body && setNewMessages(body.newCount ?? 0))
        .catch(() => {});
      setLoading(false);
      setReady();
    })();
  }, [router, setReady, loadOrgs]);

  const handleSignOut = async () => {
    await supabaseAuth.auth.signOut();
    router.push("/auth/login");
  };

  const setStatus = async (org: Org, status: "active" | "suspended") => {
    setBusyOrgId(org.id);
    setError(null);
    try {
      const res = await authedFetch(`/api/super-admin/organizations/${org.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) setError(body.error || "Failed to update organization");
      else await loadOrgs();
    } finally {
      setBusyOrgId(null);
      setConfirmingSuspend(null);
    }
  };

  if (loading) {
    return <BrandedLoader />;
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader userEmail={user?.email} role="super_admin" onSignOut={handleSignOut} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        <div className="tabbar">
          {(
            [
              ["orgs", "Organizations"],
              ["messages", "Messages"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={`tab flex items-center gap-2 ${view === key ? "tab-active" : ""}`}
            >
              {label}
              {key === "messages" && newMessages > 0 && (
                <span className="text-[11px] font-semibold bg-brand text-brand-foreground rounded-full px-1.5 min-w-[1.25rem] text-center">
                  {newMessages}
                </span>
              )}
            </button>
          ))}
        </div>

        {view === "messages" ? (
          <MessagesPanel onNewCountChange={setNewMessages} />
        ) : (
        <>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-foreground tracking-tight">Organizations</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Each sub admin runs their own organization and only ever sees its agents, leads, calls and numbers.
            </p>
          </div>
          <button
            onClick={() => setEditing("new")}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium py-2 px-4 rounded-lg text-sm transition-all active:translate-y-px"
          >
            New organization
          </button>
        </div>

        {error && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">{error}</div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {orgs.map((org) => (
            <div key={org.id} className="card p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold text-foreground truncate">{org.name}</h2>
                    {org.isFounding && (
                      <span className="text-[11px] font-medium bg-brand-soft text-brand-strong px-1.5 py-0.5 rounded-md">Your organization</span>
                    )}
                    <span
                      className={`text-[11px] font-medium px-1.5 py-0.5 rounded-md ${
                        org.status === "active"
                          ? "bg-accent-green/15 text-accent-green-foreground"
                          : "bg-destructive/10 text-destructive"
                      }`}
                    >
                      {org.status === "active" ? "Active" : "Suspended"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 truncate">
                    {org.admins.filter((a) => a.role === "admin").map((a) => a.email).join(", ") ||
                      (org.isFounding ? "You" : "No sub admin")}
                  </p>
                </div>
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Agents</dt>
                <dd className="text-foreground">{limit(org.agentCount, org.max_agents)}</dd>
                <dt className="text-muted-foreground">Phone numbers</dt>
                <dd className="text-foreground">{limit(org.numberCount, org.max_phone_numbers)}</dd>
                <dt className="text-muted-foreground">This month</dt>
                <dd className="text-foreground">
                  {!org.monthSpend ? (
                    "-"
                  ) : (
                    <>
                      ${org.monthSpend.price.toFixed(2)}
                      {org.monthly_budget_usd !== null && ` of $${Number(org.monthly_budget_usd).toFixed(2)}`}
                      {!!org.monthSpend.credit && (
                        <span className="block text-xs text-muted-foreground">
                          after ${org.monthSpend.credit.toFixed(2)} free credit
                        </span>
                      )}
                      <span className="block text-xs text-muted-foreground">
                        Telnyx cost ${org.monthSpend.cost.toFixed(2)} &middot; margin $
                        {(org.monthSpend.price - org.monthSpend.cost).toFixed(2)}
                      </span>
                    </>
                  )}
                </dd>
                <dt className="text-muted-foreground">Monthly budget</dt>
                <dd className="text-foreground">
                  {org.monthly_budget_usd === null ? "No limit" : `$${Number(org.monthly_budget_usd).toFixed(2)}`}
                </dd>
                <dt className="text-muted-foreground">Free credit &amp; minutes</dt>
                <dd className="text-foreground">
                  {(() => {
                    const parts = [
                      org.gifts?.creditLeft ? `$${org.gifts.creditLeft.toFixed(2)} credit` : null,
                      ...(org.gifts?.minutesLeft || [])
                        .filter((m) => m.minutes > 0)
                        .map((m) => `${m.minutes} min to ${countryLabel(m.countryCode)}`),
                    ].filter(Boolean);
                    return parts.length ? parts.join(" · ") : "None";
                  })()}
                </dd>
                <dt className="text-muted-foreground">Markup</dt>
                <dd className="text-foreground">
                  Calls {Number(org.call_markup_pct)}% &middot; Numbers {Number(org.number_markup_pct)}%
                </dd>
                <dt className="text-muted-foreground">Countries</dt>
                <dd className="text-foreground">{org.allowed_country_codes?.join(", ") || "All"}</dd>
                <dt className="text-muted-foreground">Calling hours</dt>
                <dd className="text-foreground">
                  {org.calling_hours_start === null || org.calling_hours_end === null
                    ? "Any time"
                    : `${hour(org.calling_hours_start)}–${hour(org.calling_hours_end)} lead's time`}
                </dd>
                <dt className="text-muted-foreground">Features</dt>
                <dd className="text-foreground">
                  {[
                    org.ai_features_enabled && "AI",
                    org.recording_enabled && "Recording",
                    org.voice_assistant_enabled && "Voice assistant",
                  ]
                    .filter(Boolean)
                    .join(" · ") || "None"}
                </dd>
              </dl>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  onClick={() => router.push(org.isFounding ? "/admin" : `/admin?orgId=${org.id}`)}
                  className="text-xs font-medium bg-primary hover:bg-primary/90 text-primary-foreground py-1.5 px-3 rounded-md transition-colors"
                >
                  Open admin
                </button>
                <button
                  onClick={() => setEditing(org)}
                  className="text-xs font-medium bg-secondary hover:bg-secondary/80 text-secondary-foreground py-1.5 px-3 rounded-md transition-colors"
                >
                  Edit settings
                </button>
                <button
                  onClick={() => setGrantsFor(org)}
                  className="text-xs font-medium bg-secondary hover:bg-secondary/80 text-secondary-foreground py-1.5 px-3 rounded-md transition-colors"
                >
                  Credit &amp; minutes
                </button>
                {!org.isFounding &&
                  (org.status === "suspended" ? (
                    <button
                      onClick={() => setStatus(org, "active")}
                      disabled={busyOrgId === org.id}
                      className="text-xs font-medium text-accent-green-foreground hover:underline disabled:opacity-40 px-2 py-1.5"
                    >
                      Reactivate
                    </button>
                  ) : confirmingSuspend === org.id ? (
                    <span className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground">Lock out everyone in {org.name}?</span>
                      <button
                        onClick={() => setStatus(org, "suspended")}
                        disabled={busyOrgId === org.id}
                        className="font-medium text-destructive hover:underline disabled:opacity-40"
                      >
                        Suspend
                      </button>
                      <button onClick={() => setConfirmingSuspend(null)} className="text-muted-foreground hover:underline">
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmingSuspend(org.id)}
                      className="text-xs font-medium text-destructive hover:underline px-2 py-1.5"
                    >
                      Suspend
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </div>
        </>
        )}
      </main>

      {grantsFor && (
        <GrantsDialog
          org={{ id: grantsFor.id, name: grantsFor.name }}
          onClose={() => setGrantsFor(null)}
          onChanged={loadOrgs}
        />
      )}

      {editing && (
        <OrgFormDialog
          org={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await loadOrgs();
          }}
        />
      )}
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <div>
        <legend className="text-sm font-semibold text-foreground">{title}</legend>
        {note && <p className="text-xs text-muted-foreground mt-0.5">{note}</p>}
      </div>
      {children}
    </fieldset>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-muted-foreground mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-muted-foreground mt-1">{hint}</span>}
    </label>
  );
}

// In most browsers the mouse wheel over a focused number box changes its
// value, which is how a scroll can silently turn "no limit" into 0. Drop the
// focus instead so the wheel scrolls the form.
function blurNumberInputOnWheel(e: React.WheelEvent) {
  const target = e.target as HTMLElement;
  if (target instanceof HTMLInputElement && target.type === "number" && document.activeElement === target) {
    target.blur();
  }
}

const inputClass =
  "field disabled:opacity-50";

function Toggle({
  label,
  checked,
  disabled,
  hint,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  hint?: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className={`flex items-start gap-2.5 ${disabled ? "opacity-50" : "cursor-pointer"}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 accent-brand"
      />
      <span>
        <span className="block text-sm text-foreground">{label}</span>
        {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}

function OrgFormDialog({
  org,
  onClose,
  onSaved,
}: {
  org: Org | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = org === null;
  const [form, setForm] = useState<FormState>(isNew ? NEW_ORG_FORM : formFromOrg(org));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = payloadFromForm(form);
      const res = isNew
        ? await authedFetch("/api/super-admin/organizations", {
            method: "POST",
            body: JSON.stringify({ ...payload, adminName: form.adminName, adminEmail: form.adminEmail }),
          })
        : await authedFetch(`/api/super-admin/organizations/${org.id}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || "Failed to save");
        return;
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4">
      {/* The title and buttons stay put; only the settings in between scroll,
          so Save is always reachable however short the window is. */}
      <form
        onSubmit={save}
        onWheel={blurNumberInputOnWheel}
        className="w-full max-w-2xl max-h-full flex flex-col bg-card border border-border rounded-2xl shadow-lg"
      >
        <div className="px-6 pt-6 pb-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">
            {isNew ? "New organization" : `Settings for ${org.name}`}
          </h2>
          {isNew && (
            <p className="text-sm text-muted-foreground mt-1">
              The sub admin signs in with this Google account and can then add their own agents.
            </p>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 py-5 space-y-6">
        <Section title="Organization">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <Field label="Organization name">
                <input className={inputClass} value={form.name} onChange={(e) => set("name", e.target.value)} required />
              </Field>
            </div>
            {isNew && (
              <>
                <Field label="Sub admin's name">
                  <input
                    className={inputClass}
                    value={form.adminName}
                    onChange={(e) => set("adminName", e.target.value)}
                    required
                  />
                </Field>
                <Field label="Sub admin's Google email">
                  <input
                    type="email"
                    className={inputClass}
                    value={form.adminEmail}
                    onChange={(e) => set("adminEmail", e.target.value)}
                    required
                  />
                </Field>
              </>
            )}
          </div>
        </Section>

        <Section title="Limits" note="Leave a box empty for no limit.">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Agents">
              <input type="number" min={0} step={1} className={inputClass} value={form.max_agents} onChange={(e) => set("max_agents", e.target.value)} />
            </Field>
            <Field label="Phone numbers" hint="The sub admin buys within this; 0 stops buying">
              <input type="number" min={0} step={1} className={inputClass} value={form.max_phone_numbers} onChange={(e) => set("max_phone_numbers", e.target.value)} />
            </Field>
            <Field label="Simultaneous calls">
              <input type="number" min={0} step={1} className={inputClass} value={form.max_concurrent_calls} onChange={(e) => set("max_concurrent_calls", e.target.value)} />
            </Field>
          </div>
        </Section>

        <Section
          title="Billing"
          note="Calls and numbers are priced at Telnyx's cost plus these markups; a number's price is fixed when it's bought. The sub admin only ever sees prices, not your cost or markup."
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Monthly budget (USD)" hint="Calls stop when it's used up">
              <input type="number" min={0} step="0.01" className={inputClass} value={form.monthly_budget_usd} onChange={(e) => set("monthly_budget_usd", e.target.value)} placeholder="No limit" />
            </Field>
            <Field label="Call markup (%)">
              <input type="number" min={0} step="0.1" className={inputClass} value={form.call_markup_pct} onChange={(e) => set("call_markup_pct", e.target.value)} required />
            </Field>
            <Field label="Number markup (%)">
              <input type="number" min={0} step="0.1" className={inputClass} value={form.number_markup_pct} onChange={(e) => set("number_markup_pct", e.target.value)} required />
            </Field>
          </div>
        </Section>

        <Section title="Calling rules" note="Allowed countries apply now. Calling hours are saved and apply in an upcoming update.">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-3">
              <Field label="Allowed countries" hint="2-letter codes separated by commas, like US, CA, PK. Empty means every country.">
                <input className={inputClass} value={form.allowed_country_codes} onChange={(e) => set("allowed_country_codes", e.target.value.toUpperCase())} placeholder="All countries" />
              </Field>
            </div>
            <Field label="Calling hours from" hint="Lead's local time, 0–23">
              <input type="number" min={0} max={23} step={1} className={inputClass} value={form.calling_hours_start} onChange={(e) => set("calling_hours_start", e.target.value)} placeholder="Any time" />
            </Field>
            <Field label="Calling hours until" hint="1–24">
              <input type="number" min={1} max={24} step={1} className={inputClass} value={form.calling_hours_end} onChange={(e) => set("calling_hours_end", e.target.value)} placeholder="Any time" />
            </Field>
          </div>
        </Section>

        <Section title="Features" note="AI and recording switches apply in an upcoming update.">
          <div className="space-y-3">
            <Toggle
              label="AI features"
              hint="Call transcripts and AI-written follow-up emails"
              checked={form.ai_features_enabled}
              onChange={(v) => set("ai_features_enabled", v)}
            />
            <Toggle label="Call recording" checked={form.recording_enabled} onChange={(v) => set("recording_enabled", v)} />
            <div className="pl-6 max-w-xs">
              <Field label="Delete recordings after (days)" hint="Empty keeps them">
                <input type="number" min={1} step={1} className={inputClass} value={form.recording_retention_days} onChange={(e) => set("recording_retention_days", e.target.value)} disabled={!form.recording_enabled} />
              </Field>
            </div>
            <Toggle
              label="Voice assistant"
              hint={org?.isFounding ? "Answers inbound calls on your voice agent number" : "Only available for JETZT for now"}
              checked={form.voice_assistant_enabled}
              disabled={!org?.isFounding}
              onChange={(v) => set("voice_assistant_enabled", v)}
            />
          </div>
        </Section>

        </div>

        <div className="px-6 py-4 border-t border-border space-y-3">
        {error && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">{error}</div>
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground font-medium py-2.5 px-4 rounded-lg text-sm transition-all active:translate-y-px"
          >
            {saving ? "Saving..." : isNew ? "Create organization" : "Save changes"}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 bg-secondary hover:bg-secondary/80 text-secondary-foreground font-medium py-2.5 px-4 rounded-lg text-sm transition-colors"
          >
            Cancel
          </button>
        </div>
        </div>
      </form>
    </div>
  );
}

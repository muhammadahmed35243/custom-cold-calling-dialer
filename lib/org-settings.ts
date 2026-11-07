// Validation for the organization settings the super admin edits. Shared by
// the create and update routes; the database has matching check constraints
// as a backstop (migration 0007).

type NumberRule = { label: string; nullable: boolean; integer: boolean; min: number; max?: number };

const NUMBER_RULES: Record<string, NumberRule> = {
  monthly_budget_usd: { label: "Monthly budget", nullable: true, integer: false, min: 0 },
  call_markup_pct: { label: "Call markup", nullable: false, integer: false, min: 0, max: 1000 },
  number_markup_pct: { label: "Number markup", nullable: false, integer: false, min: 0, max: 1000 },
  voice_assistant_price_per_min: { label: "Voice assistant price", nullable: false, integer: false, min: 0, max: 100 },
  max_agents: { label: "Max agents", nullable: true, integer: true, min: 0 },
  max_phone_numbers: { label: "Max phone numbers", nullable: true, integer: true, min: 0 },
  max_concurrent_calls: { label: "Max simultaneous calls", nullable: true, integer: true, min: 0 },
  recording_retention_days: { label: "Recording retention", nullable: true, integer: true, min: 1 },
  calling_hours_start: { label: "Calling hours start", nullable: true, integer: true, min: 0, max: 23 },
  calling_hours_end: { label: "Calling hours end", nullable: true, integer: true, min: 1, max: 24 },
};

const BOOLEAN_FIELDS = ["ai_features_enabled", "voice_assistant_enabled", "recording_enabled"];

export type OrgSettings = Record<string, string | number | boolean | string[] | null>;

// The voice runtime reads one shared configuration until it becomes
// organization-aware, so only JETZT can have the assistant for now.
export const VOICE_ONLY_FOUNDING_MESSAGE =
  "The voice assistant can only be switched on for JETZT for now. Other organizations get it in a later update.";

// Picks the settings present in `body` and validates them. Fields that are
// absent are left out, so the same function serves partial updates.
export function parseOrgSettings(body: Record<string, unknown>): { settings: OrgSettings } | { error: string } {
  const settings: OrgSettings = {};

  if ("name" in body) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return { error: "Organization name can't be empty" };
    if (name.length > 100) return { error: "Organization name is too long" };
    settings.name = name;
  }

  for (const [field, rule] of Object.entries(NUMBER_RULES)) {
    if (!(field in body)) continue;
    const raw = body[field];
    if (raw === null || raw === "" || raw === undefined) {
      if (!rule.nullable) return { error: `${rule.label} is required` };
      settings[field] = null;
      continue;
    }
    const value = Number(raw);
    const outOfRange = value < rule.min || (rule.max !== undefined && value > rule.max);
    if (!Number.isFinite(value) || outOfRange || (rule.integer && !Number.isInteger(value))) {
      const range = rule.max !== undefined ? `between ${rule.min} and ${rule.max}` : `${rule.min} or more`;
      return { error: `${rule.label} must be ${rule.integer ? "a whole number " : ""}${range}` };
    }
    settings[field] = value;
  }

  for (const field of BOOLEAN_FIELDS) {
    if (!(field in body)) continue;
    if (typeof body[field] !== "boolean") return { error: `${field} must be true or false` };
    settings[field] = body[field] as boolean;
  }

  if ("allowed_country_codes" in body) {
    const raw = body.allowed_country_codes;
    const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : raw == null ? [] : null;
    if (!list) return { error: "Allowed countries must be a list of 2-letter country codes" };
    const codes = Array.from(new Set(list.map((c) => String(c).trim().toUpperCase()).filter(Boolean)));
    if (codes.some((c) => !/^[A-Z]{2}$/.test(c))) {
      return { error: "Allowed countries must be 2-letter country codes, like US, CA, PK" };
    }
    // Empty means every country.
    settings.allowed_country_codes = codes.length ? codes : null;
  }

  const start = settings.calling_hours_start;
  const end = settings.calling_hours_end;
  if (typeof start === "number" && typeof end === "number" && start >= end) {
    return { error: "Calling hours must start before they end" };
  }
  if (("calling_hours_start" in settings) !== ("calling_hours_end" in settings) || (start === null) !== (end === null)) {
    return { error: "Set both calling hours (start and end), or neither" };
  }

  return { settings };
}

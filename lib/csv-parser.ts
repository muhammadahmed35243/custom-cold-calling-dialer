import Papa from "papaparse";
import { validateAndFormatPhone } from "./phone";

export type ParsedLead = {
  name: string;
  phone: string;
  email?: string;
  company?: string;
  notes?: string;
};

export type ParseResult = {
  validLeads: ParsedLead[];
  errors: Array<{ row: number; error: string }>;
};

// Lead sheets show up with all kinds of header names depending on the
// source (a scraped list, a client's own spreadsheet, an outreach-campaign
// template, ...) -- rather than requiring an exact header string, check
// whether the normalized header CONTAINS one of these keywords. That
// catches prefixed/suffixed variants ("Direct Phone Number", "Company
// Name", "Decision Maker") that an exact-match alias list would miss.
//
// Order matters: company/phone/email are matched first because they use
// more specific keywords, then name last with its broader "name"/"contact"
// keywords -- otherwise "Company Name" or "Contact Person" would get
// claimed by the name field before company/contact-specific logic runs.
const HEADER_KEYWORDS: [field: keyof Pick<ParsedLead, "company" | "phone" | "email" | "name">, keywords: string[]][] = [
  ["company", ["company", "businessname", "organization", "niche"]],
  ["phone", ["phone", "mobile", "cell", "telephone"]],
  ["email", ["email"]],
  ["name", ["name", "decisionmaker", "contact"]],
];

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isBlankValue(value: string | undefined): boolean {
  if (!value) return true;
  const v = value.trim().toLowerCase();
  return v === "" || v === "n/a" || v === "na" || v === "-" || v === "none";
}

export function parseCSV(csvText: string): ParseResult {
  const validLeads: ParsedLead[] = [];
  const errors: Array<{ row: number; error: string }> = [];

  const result = Papa.parse(csvText, { header: true, skipEmptyLines: true });

  if (result.errors.length) {
    return { validLeads: [], errors: result.errors.map((e, i) => ({ row: i + 1, error: e.message })) };
  }

  const rows = result.data as Record<string, string>[];
  const rawHeaders = (result.meta.fields || []).map((h) => h);

  // Map each canonical field to whichever actual header matched it, and
  // track which headers are "claimed" so anything left over can be folded
  // into notes instead of silently dropped.
  const fieldToHeader: Partial<Record<"company" | "phone" | "email" | "name", string>> = {};
  const claimedHeaders = new Set<string>();

  for (const [field, keywords] of HEADER_KEYWORDS) {
    for (const header of rawHeaders) {
      if (fieldToHeader[field] || claimedHeaders.has(header)) continue;
      const normalized = normalizeHeader(header);
      if (keywords.some((kw) => normalized.includes(kw))) {
        fieldToHeader[field] = header;
        claimedHeaders.add(header);
      }
    }
  }

  const notesHeader = rawHeaders.find((h) => normalizeHeader(h) === "notes");
  if (notesHeader) claimedHeaders.add(notesHeader);
  const extraHeaders = rawHeaders.filter((h) => !claimedHeaders.has(h));

  rows.forEach((row, index) => {
    const rowNumber = index + 2; // Header is row 1

    const name = fieldToHeader.name ? row[fieldToHeader.name]?.trim() : undefined;
    const phone = fieldToHeader.phone ? row[fieldToHeader.phone]?.trim() : undefined;
    const email = fieldToHeader.email ? row[fieldToHeader.email]?.trim() : undefined;
    const company = fieldToHeader.company ? row[fieldToHeader.company]?.trim() : undefined;

    if (!name) {
      errors.push({ row: rowNumber, error: "Missing name" });
      return;
    }

    if (!phone) {
      errors.push({ row: rowNumber, error: "Missing phone" });
      return;
    }

    const phoneResult = validateAndFormatPhone(phone);
    if (!phoneResult.valid) {
      errors.push({ row: rowNumber, error: phoneResult.error || "Invalid phone number" });
      return;
    }

    // Anything not mapped to name/phone/email/company (city, website,
    // discovery source, pain point, pitched service, ...) still has real
    // value for the agent about to make the call -- keep it as labeled
    // lines in notes rather than dropping it.
    const noteLines: string[] = [];
    if (notesHeader && !isBlankValue(row[notesHeader])) {
      noteLines.push(row[notesHeader].trim());
    }
    for (const header of extraHeaders) {
      const value = row[header];
      if (!isBlankValue(value)) {
        noteLines.push(`${header.trim()}: ${value.trim()}`);
      }
    }

    validLeads.push({
      name,
      phone: phoneResult.formatted!,
      email: isBlankValue(email) ? undefined : email,
      company: isBlankValue(company) ? undefined : company,
      notes: noteLines.length ? noteLines.join("\n") : undefined,
    });
  });

  return { validLeads, errors };
}

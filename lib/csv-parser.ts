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

export function parseCSV(csvText: string): ParseResult {
  const validLeads: ParsedLead[] = [];
  const errors: Array<{ row: number; error: string }> = [];

  const result = Papa.parse(csvText, { header: true, skipEmptyLines: true });

  if (result.errors.length) {
    return { validLeads: [], errors: result.errors.map((e, i) => ({ row: i + 1, error: e.message })) };
  }

  const rows = result.data as Record<string, string>[];

  rows.forEach((row, index) => {
    const rowNumber = index + 2; // Header is row 1
    const name = row.name?.trim();
    const phone = row.phone?.trim();
    const email = row.email?.trim();
    const company = row.company?.trim();
    const notes = row.notes?.trim();

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

    validLeads.push({
      name,
      phone: phoneResult.formatted!,
      email: email || undefined,
      company: company || undefined,
      notes: notes || undefined,
    });
  });

  return { validLeads, errors };
}

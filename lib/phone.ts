import { parsePhoneNumber, isValidPhoneNumber, CountryCode } from "libphonenumber-js";

function tryParse(phone: string, region?: CountryCode): string | null {
  try {
    if (!isValidPhoneNumber(phone, region)) return null;
    const parsed = parsePhoneNumber(phone, region);
    return parsed ? (parsed.format("E.164") as string) : null;
  } catch {
    return null;
  }
}

// Leads come from mixed sources -- some sheets write numbers with an
// explicit country code and no "+" (e.g. "1 6193547036" for a US lead),
// others write a bare local number for whichever country that campaign
// targets. Spreadsheets also frequently strip a leading "+" entirely.
export function validateAndFormatPhone(phone: string, regionCode: CountryCode = "PK"): { valid: boolean; formatted?: string; error?: string } {
  const trimmed = phone.trim();
  const digitsOnly = trimmed.replace(/[^\d+]/g, "");

  const candidates: string[] = [];
  if (digitsOnly.startsWith("+")) {
    candidates.push(digitsOnly);
  } else {
    const bareDigits = digitsOnly.replace(/\D/g, "");
    if (bareDigits.length === 11 && bareDigits.startsWith("1")) {
      candidates.push(`+${bareDigits}`); // US/Canada with country code, no "+"
    } else if (bareDigits.length === 12 && bareDigits.startsWith("92")) {
      candidates.push(`+${bareDigits}`); // Pakistan with country code, no "+"
    }
  }

  for (const candidate of candidates) {
    const formatted = tryParse(candidate);
    if (formatted) return { valid: true, formatted };
  }

  // No recognizable country code prefix -- fall back to the caller's
  // default region, then the other region this app actually serves leads
  // in, before giving up.
  for (const region of [regionCode, regionCode === "PK" ? "US" : "PK"] as CountryCode[]) {
    const formatted = tryParse(trimmed, region);
    if (formatted) return { valid: true, formatted };
  }

  return { valid: false, error: `Invalid phone number: ${phone}` };
}

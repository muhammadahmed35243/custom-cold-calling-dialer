import { parsePhoneNumber, isValidPhoneNumber, CountryCode } from "libphonenumber-js";

export function validateAndFormatPhone(phone: string, regionCode: CountryCode = "PK"): { valid: boolean; formatted?: string; error?: string } {
  try {
    const parsed = parsePhoneNumber(phone, regionCode);
    if (!parsed || !isValidPhoneNumber(phone, regionCode)) {
      return { valid: false, error: `Invalid phone number: ${phone}` };
    }
    return { valid: true, formatted: parsed.format("E.164") as string };
  } catch {
    return { valid: false, error: `Failed to parse phone: ${phone}` };
  }
}

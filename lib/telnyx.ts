import nacl from "tweetnacl";
import { supabaseServiceClient } from "./supabase";
import { FOUNDING_ORG_ID } from "./authz";

// Which number an agent's outbound calls show as caller ID. Checks, in
// order: a number an admin specifically assigned to this agent, then the
// number marked active in the agent's own organization, then (founding org
// only) the original TELNYX_PHONE_NUMBER env var. Other organizations never
// fall back to JETZT's number.
export async function getOutboundNumberForAgent(agentEmail: string): Promise<string> {
  const { data: agent } = await supabaseServiceClient
    .from("agents")
    .select("org_id, outbound_phone_number_id, phone_numbers:outbound_phone_number_id(phone_number, released_at)")
    .eq("email", agentEmail)
    .single();

  type Assigned = { phone_number: string; released_at: string | null };
  const assignedRaw = agent?.phone_numbers as Assigned | Assigned[] | null;
  const assigned = Array.isArray(assignedRaw) ? assignedRaw[0] : assignedRaw;
  if (assigned?.phone_number && !assigned.released_at) return assigned.phone_number;

  const orgId = agent?.org_id as string | undefined;
  if (orgId) {
    const { data: active } = await supabaseServiceClient
      .from("phone_numbers")
      .select("phone_number")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .is("released_at", null)
      .maybeSingle();
    if (active?.phone_number) return active.phone_number;
  }

  if (orgId === FOUNDING_ORG_ID && process.env.TELNYX_PHONE_NUMBER) {
    return process.env.TELNYX_PHONE_NUMBER;
  }

  throw new Error("No outbound number is set up for your organization yet. Ask your admin to buy or assign one.");
}

// Every caller ID this organization may show (digits only): the numbers it
// holds, plus JETZT's original env number for the founding org.
export async function getOrgCallerIds(orgId: string): Promise<Set<string>> {
  const { data, error } = await supabaseServiceClient
    .from("phone_numbers")
    .select("phone_number")
    .eq("org_id", orgId)
    .is("released_at", null);
  if (error) throw new Error(`Couldn't load the organization's numbers: ${error.message}`);

  const ids = new Set((data || []).map((n: { phone_number: string }) => n.phone_number.replace(/\D/g, "")));
  if (orgId === FOUNDING_ORG_ID && process.env.TELNYX_PHONE_NUMBER) {
    ids.add(process.env.TELNYX_PHONE_NUMBER.replace(/\D/g, ""));
  }
  return ids;
}

// Ends a live call through Call Control. Used to stop browser calls that
// didn't come from the dialer (and so skipped its budget and limit checks).
export async function hangupCall(callControlId: string): Promise<void> {
  const res = await fetch(
    `https://api.telnyx.com/v2/calls/${encodeURIComponent(callControlId)}/actions/hangup`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.TELNYX_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    }
  );
  // 422 means the call already ended, which is the outcome we wanted.
  if (!res.ok && res.status !== 422) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to hang up call (${res.status}): ${body.slice(0, 300)}`);
  }
}

// Telnyx's TeXML Calls API is a Twilio-Calls-API-compatible endpoint: same
// To/From/Url form-encoded shape, same TwiML-style XML response format from
// your webhook. This lets us reuse the exact same call flow and TeXML
// builders we used for Twilio's TwiML.
export async function initiateCall(agentPhone: string, callRecordId: string, agentEmail: string) {
  const connectUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/calls/connect?callRecordId=${callRecordId}`;
  const statusCallbackUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/calls/status`;
  const connectionId = process.env.TELNYX_TEXML_CONNECTION_ID!;
  const fromNumber = await getOutboundNumberForAgent(agentEmail);

  const res = await fetch(`https://api.telnyx.com/v2/texml/calls/${connectionId}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.TELNYX_API_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      To: agentPhone,
      From: fromNumber,
      Url: connectUrl,
      StatusCallback: statusCallbackUrl,
      StatusCallbackEvent: "initiated ringing answered completed",
      Timeout: "60",
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(
      `Telnyx call creation failed (${res.status}): ${JSON.stringify(data)}`
    );
  }

  const sid = data.sid || data.call_sid || data?.data?.call_sid;
  if (!sid) {
    throw new Error(`Telnyx response missing call SID: ${JSON.stringify(data)}`);
  }

  return { sid };
}

// Telnyx signs webhooks with Ed25519, not HMAC like Twilio. The signature and
// timestamp arrive as headers, verified against Telnyx's public key (from
// Portal -> Account Settings -> Public Key), not a shared secret.
export function verifyTelnyxSignature(
  rawBody: string,
  signatureHeader: string,
  timestampHeader: string
): boolean {
  try {
    const publicKey = process.env.TELNYX_PUBLIC_KEY!;
    const signedPayload = `${timestampHeader}|${rawBody}`;

    return nacl.sign.detached.verify(
      Buffer.from(signedPayload, "utf-8"),
      Buffer.from(signatureHeader, "base64"),
      Buffer.from(publicKey, "base64")
    );
  } catch {
    return false;
  }
}

// Call Control's recording API -- used for WebRTC calls, which have no
// TeXML <Dial record> attribute to lean on the way phone-bridge calls do.
// Recording stops automatically on hangup and delivers a
// call.recording.saved webhook (handled in
// app/api/calls/webrtc-recording/route.ts), same as the phone-bridge flow's
// recordingStatusCallback.
export async function startCallControlRecording(callControlId: string) {
  const res = await fetch(
    `https://api.telnyx.com/v2/calls/${callControlId}/actions/record_start`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.TELNYX_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ format: "mp3", channels: "dual" }),
    }
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to start recording (${res.status}): ${body.slice(0, 500)}`);
  }
}

export async function buildComplianceAndDialTeXML(
  dialTo: string,
  recordingUrl: string,
  dialStatusUrl: string,
  agentEmail: string
) {
  const callerId = await getOutboundNumberForAgent(agentEmail);
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>You're using JETZT Dialer. Have a great day.</Say>
  <Dial callerId="${callerId}" record="record-from-answer-dual" recordingStatusCallback="${recordingUrl}" recordingStatusCallbackEvent="completed" action="${dialStatusUrl}">
    <Number>${dialTo}</Number>
  </Dial>
</Response>`;
}

// Search Telnyx's inventory of purchasable numbers. Only numbers returned
// from a search can actually be ordered -- Telnyx ties orders to a prior
// search result, not an arbitrary number string.
export type AvailableNumber = {
  phoneNumber: string;
  phoneNumberType: string;
  countryCode: string;
  monthlyCost: number | null;
  upfrontCost: number | null;
  // Where the number is and what it can do, from Telnyx's listing.
  locality: string | null;
  region: string | null;
  rateCenter: string | null;
  features: string[];
  // Not an exact match for the filters (Telnyx suggested it as close).
  bestEffort: boolean;
  // Ready to use as soon as it's bought.
  quickship: boolean;
};

export const NUMBER_TYPES = ["local", "toll_free", "mobile", "national"] as const;
export type NumberType = (typeof NUMBER_TYPES)[number];
export const NUMBER_FEATURES = ["sms", "mms", "fax", "emergency"] as const;

export type NumberSearch = {
  countryCode: string;
  areaCode?: string;
  locality?: string;
  administrativeArea?: string;
  numberType?: NumberType;
  features?: string[];
  contains?: string;
};

// Telnyx's search returns at most 50 numbers at a time.
const SEARCH_LIMIT = 50;

function titleCase(value: string | null): string | null {
  return value
    ? value.toLowerCase().replace(/(^|[\s\-/(:.'])([a-z])/g, (_, before: string, letter: string) => before + letter.toUpperCase())
    : null;
}

function toAvailableNumber(n: any, countryCode: string): AvailableNumber {
  const region = (type: string): string | null =>
    (n.region_information || []).find((r: any) => r.region_type === type)?.region_name ?? null;
  const cost = (value: unknown) => (value != null && value !== "" ? Number(value) : null);
  return {
    phoneNumber: n.phone_number,
    phoneNumberType: n.phone_number_type,
    countryCode: countryCode.toUpperCase(),
    monthlyCost: cost(n.cost_information?.monthly_cost),
    upfrontCost: cost(n.cost_information?.upfront_cost),
    locality: titleCase(region("location")),
    region: region("state"),
    rateCenter: region("rate_center"),
    features: (n.features || []).map((f: any) => f?.name).filter(Boolean),
    bestEffort: !!n.best_effort,
    quickship: !!n.quickship,
  };
}

export async function searchAvailableNumbers(search: NumberSearch): Promise<AvailableNumber[]> {
  const params = new URLSearchParams({
    "filter[country_code]": search.countryCode.toUpperCase(),
    "filter[limit]": String(SEARCH_LIMIT),
  });
  if (search.areaCode) params.set("filter[national_destination_code]", search.areaCode);
  if (search.locality) params.set("filter[locality]", search.locality);
  if (search.administrativeArea) params.set("filter[administrative_area]", search.administrativeArea);
  if (search.numberType) params.set("filter[phone_number_type]", search.numberType);
  if (search.contains) params.set("filter[phone_number][contains]", search.contains);
  for (const feature of search.features || []) params.append("filter[features][]", feature);

  const res = await fetch(`https://api.telnyx.com/v2/available_phone_numbers?${params.toString()}`, {
    headers: { Authorization: `Bearer ${process.env.TELNYX_API_KEY}` },
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Number search failed (${res.status}): ${JSON.stringify(data).slice(0, 300)}`);
  }

  const numbers: AvailableNumber[] = (data.data || []).map((n: any) => toAvailableNumber(n, search.countryCode));
  // Telnyx doesn't reliably apply the features filter, so enforce it here.
  const wanted = search.features || [];
  return wanted.length ? numbers.filter((n) => wanted.every((f) => n.features.includes(f))) : numbers;
}

// Looks one number up in Telnyx's inventory, to read its real price on the
// server before buying it (the browser's copy of the price can't be trusted).
// Null if Telnyx no longer offers it.
export async function findAvailableNumber(phoneNumber: string, countryCode: string): Promise<AvailableNumber | null> {
  const digits = phoneNumber.replace(/\D/g, "");
  if (!digits) return null;
  const params = new URLSearchParams({
    "filter[country_code]": countryCode.toUpperCase(),
    "filter[phone_number][contains]": digits,
    "filter[limit]": "10",
  });

  const res = await fetch(`https://api.telnyx.com/v2/available_phone_numbers?${params.toString()}`, {
    headers: { Authorization: `Bearer ${process.env.TELNYX_API_KEY}` },
  });
  if (!res.ok) return null;

  const match = ((await res.json()).data || []).find(
    (n: any) => String(n.phone_number || "").replace(/\D/g, "") === digits
  );
  return match ? toAvailableNumber(match, countryCode) : null;
}

// Gives a number back to Telnyx, which stops its monthly charge. It can't be
// undone: the number returns to Telnyx's inventory.
export async function releaseNumber(telnyxId: string): Promise<void> {
  const res = await fetch(`https://api.telnyx.com/v2/phone_numbers/${encodeURIComponent(telnyxId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${process.env.TELNYX_API_KEY}` },
  });
  // 404: Telnyx no longer has it on the account, which is the goal.
  if (!res.ok && res.status !== 404) {
    const body = await res.text().catch(() => "");
    throw new Error(`Releasing the number failed (${res.status}): ${body.slice(0, 300)}`);
  }
}

// Numbers must come from a prior search (searchAvailableNumbers) -- Telnyx
// rejects an order for a number it didn't just offer you.
export async function purchaseNumber(phoneNumber: string): Promise<{ telnyxId: string }> {
  const res = await fetch("https://api.telnyx.com/v2/number_orders", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.TELNYX_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ phone_numbers: [{ phone_number: phoneNumber }] }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Number purchase failed (${res.status}): ${JSON.stringify(data).slice(0, 500)}`);
  }

  const telnyxId = data.data?.phone_numbers?.[0]?.id;
  if (!telnyxId) {
    throw new Error(`Purchase response missing number id: ${JSON.stringify(data).slice(0, 300)}`);
  }

  return { telnyxId };
}

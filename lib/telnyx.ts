import nacl from "tweetnacl";

const telnyxPhoneNumber = process.env.TELNYX_PHONE_NUMBER!;

// Telnyx's TeXML Calls API is a Twilio-Calls-API-compatible endpoint: same
// To/From/Url form-encoded shape, same TwiML-style XML response format from
// your webhook. This lets us reuse the exact same call flow and TeXML
// builders we used for Twilio's TwiML.
export async function initiateCall(agentPhone: string, callRecordId: string) {
  const connectUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/calls/connect?callRecordId=${callRecordId}`;
  const statusCallbackUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/calls/status`;
  const connectionId = process.env.TELNYX_TEXML_CONNECTION_ID!;

  const res = await fetch(`https://api.telnyx.com/v2/texml/calls/${connectionId}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.TELNYX_API_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      To: agentPhone,
      From: telnyxPhoneNumber,
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

export function buildComplianceAndDialTeXML(dialTo: string, recordingUrl: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>You're using JETZT Dialer. Have a great day.</Say>
  <Dial callerId="${telnyxPhoneNumber}" record="record-from-answer-dual" recordingStatusCallback="${recordingUrl}" recordingStatusCallbackEvent="completed">
    <Number>${dialTo}</Number>
  </Dial>
</Response>`;
}

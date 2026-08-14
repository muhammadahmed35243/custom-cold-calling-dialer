import twilio from "twilio";
import crypto from "crypto";

const getTwilioClient = () => {
  return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
};

const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER!;

export async function initiateCall(agentPhone: string, callRecordId: string) {
  const connectUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/calls/connect?callRecordId=${callRecordId}`;
  const client = getTwilioClient();

  return client.calls.create({
    to: agentPhone,
    from: twilioPhoneNumber,
    url: connectUrl,
  });
}

export function verifyTwilioSignature(
  requestBody: Record<string, string>,
  twilioSignature: string,
  url: string
): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN!;
  const data = url + Object.keys(requestBody)
    .sort()
    .map((key) => key + requestBody[key])
    .join("");

  const hash = crypto
    .createHmac("sha1", authToken)
    .update(data)
    .digest("base64");

  return hash === twilioSignature;
}

export function buildDialTwiML(dialTo: string, recordingUrl: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${twilioPhoneNumber}" recordingStatusCallback="${recordingUrl}" recordingStatusCallbackEvent="completed">
    <Number>${dialTo}</Number>
  </Dial>
</Response>`;
}

export function buildComplianceAndDialTwiML(dialTo: string, recordingUrl: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>This call is being recorded for quality assurance and training purposes.</Say>
  <Dial callerId="${twilioPhoneNumber}" recordingStatusCallback="${recordingUrl}" recordingStatusCallbackEvent="completed">
    <Number>${dialTo}</Number>
  </Dial>
</Response>`;
}

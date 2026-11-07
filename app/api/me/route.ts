import { NextRequest, NextResponse } from "next/server";
import { getActor, canBuyNumbers } from "@/lib/authz";

// Who the caller is and what their organization has switched on, so pages can
// route by role and hide what the organization doesn't have. Limits and
// switches only: never JETZT's costs or markups.
export async function GET(req: NextRequest) {
  const { actor, error: authError } = await getActor(req);
  if (authError) return authError;

  const { org } = actor;
  return NextResponse.json({
    email: actor.email,
    role: actor.role,
    canBuyNumbers: canBuyNumbers(actor),
    org: {
      id: org.id,
      name: org.name,
      status: org.status,
      aiFeaturesEnabled: org.ai_features_enabled,
      voiceAssistantEnabled: org.voice_assistant_enabled,
      recordingEnabled: org.recording_enabled,
      maxAgents: org.max_agents,
      maxPhoneNumbers: org.max_phone_numbers,
    },
  });
}

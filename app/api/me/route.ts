import { NextRequest, NextResponse } from "next/server";
import { getActor, canBuyNumbers, ADMIN_ROLES } from "@/lib/authz";
import { monthSpend } from "@/lib/billing";

// Who the caller is and what their organization has switched on, so pages can
// route by role and hide what the organization doesn't have. Limits and
// switches only: never JETZT's costs or markups.
export async function GET(req: NextRequest) {
  const { actor, error: authError } = await getActor(req);
  if (authError) return authError;

  const { org } = actor;

  // How much of this month's budget is used, for the warning banner. Admins
  // see the amounts; agents only how close it is.
  let budget: { usedPct: number; limitUsd?: number; spentUsd?: number } | null = null;
  if (org.monthly_budget_usd != null) {
    try {
      const limitUsd = Number(org.monthly_budget_usd);
      const spentUsd = (await monthSpend(org.id)).totalPrice;
      const usedPct = limitUsd > 0 ? Math.round((spentUsd / limitUsd) * 100) : 100;
      budget = ADMIN_ROLES.includes(actor.role) ? { usedPct, limitUsd, spentUsd } : { usedPct };
    } catch (err) {
      console.error("me: couldn't read this month's spend", err);
    }
  }

  return NextResponse.json({
    email: actor.email,
    role: actor.role,
    canBuyNumbers: canBuyNumbers(actor),
    budget,
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

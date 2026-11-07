import { NextRequest, NextResponse } from "next/server";
import {
  requireRole,
  targetOrgId,
  loadOrganization,
  ADMIN_ROLES,
  FOUNDING_ORG_ID,
  type Actor,
} from "@/lib/authz";

type VoiceAdminResult =
  | { actor: Actor; orgId: string; error?: undefined }
  | { actor?: undefined; orgId?: undefined; error: NextResponse };

// Guard for all of app/api/voice-agent/*: an admin of an organization that has
// the voice assistant switched on. Until the voice runtime is
// organization-aware it reads one shared configuration, so only JETZT (the
// founding org) can have the assistant for now.
export async function requireAdmin(req: NextRequest): Promise<VoiceAdminResult> {
  const { actor, error } = await requireRole(req, ADMIN_ROLES);
  if (error) return { error };

  const orgId = targetOrgId(req, actor);
  const org = orgId === actor.orgId ? actor.org : await loadOrganization(orgId);
  if (!org || orgId !== FOUNDING_ORG_ID || !org.voice_assistant_enabled) {
    return {
      error: NextResponse.json(
        { error: "The voice assistant isn't enabled for this organization" },
        { status: 403 }
      ),
    };
  }

  return { actor, orgId };
}

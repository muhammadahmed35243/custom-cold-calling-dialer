import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import { getActor } from "@/lib/authz";
import { parseCSV } from "@/lib/csv-parser";

export async function POST(req: NextRequest) {
  const { actor, error: authError } = await getActor(req);
  if (authError) return authError;

  try {
    const { csv, replaceExisting } = await req.json();

    if (!csv || typeof csv !== "string") {
      return NextResponse.json({ error: "Invalid CSV content" }, { status: 400 });
    }

    const parseResult = parseCSV(csv);

    if (parseResult.validLeads.length === 0 && parseResult.errors.length > 0) {
      return NextResponse.json(
        { error: "No valid leads found", errors: parseResult.errors },
        { status: 400 }
      );
    }

    // Only clears untouched (pending) leads -- same scope as
    // DELETE /api/leads/pending, never leads that are in_progress or
    // already have real call history.
    if (replaceExisting) {
      const { error: clearError } = await supabaseServiceClient
        .from("leads")
        .delete()
        .eq("status", "pending")
        .eq("org_id", actor.orgId)
        .eq("owner_email", actor.email);

      if (clearError) {
        return NextResponse.json(
          { error: `Failed to clear existing pending leads: ${clearError.message}` },
          { status: 500 }
        );
      }
    }

    const batchId = crypto.randomUUID();
    const { error: insertError } = await supabaseServiceClient
      .from("leads")
      .insert(
        parseResult.validLeads.map((lead) => ({
          ...lead,
          uploaded_batch_id: batchId,
          owner_email: actor.email,
          org_id: actor.orgId,
        }))
      );

    if (insertError) {
      return NextResponse.json(
        { error: `Database error: ${insertError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      imported: parseResult.validLeads.length,
      errors: parseResult.errors,
      batchId,
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Server error: ${error}` },
      { status: 500 }
    );
  }
}

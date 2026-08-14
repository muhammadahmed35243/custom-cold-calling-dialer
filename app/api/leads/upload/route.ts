import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import { getAuthenticatedUser } from "@/lib/api-auth";
import { parseCSV } from "@/lib/csv-parser";

export async function POST(req: NextRequest) {
  const { user } = await getAuthenticatedUser(req);
  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { csv } = await req.json();

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

    const batchId = crypto.randomUUID();
    const { error: insertError } = await supabaseServiceClient
      .from("leads")
      .insert(
        parseResult.validLeads.map((lead) => ({
          ...lead,
          uploaded_batch_id: batchId,
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

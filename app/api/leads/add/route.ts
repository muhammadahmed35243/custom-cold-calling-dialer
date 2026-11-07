import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import { getActor } from "@/lib/authz";
import { validateAndFormatPhone } from "@/lib/phone";

export async function POST(req: NextRequest) {
  const { actor, error: authError } = await getActor(req);
  if (authError) return authError;

  try {
    const { name, phone, email, company, notes } = await req.json();

    if (!name || !phone) {
      return NextResponse.json(
        { error: "Name and phone are required" },
        { status: 400 }
      );
    }

    // Validate and format phone
    const phoneResult = validateAndFormatPhone(phone);
    if (!phoneResult.valid || !phoneResult.formatted) {
      return NextResponse.json(
        { error: phoneResult.error || "Invalid phone number" },
        { status: 400 }
      );
    }
    const formattedPhone = phoneResult.formatted;

    // Insert lead
    const { data: lead, error } = await supabaseServiceClient
      .from("leads")
      .insert([
        {
          name: name.trim(),
          phone: formattedPhone,
          email: email ? email.trim() : null,
          company: company ? company.trim() : null,
          notes: notes ? notes.trim() : null,
          status: "pending",
          owner_email: actor.email,
          org_id: actor.orgId,
        },
      ])
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: `Failed to add lead: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      lead,
      message: `Lead "${name}" added successfully`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Server error: ${error}` },
      { status: 500 }
    );
  }
}

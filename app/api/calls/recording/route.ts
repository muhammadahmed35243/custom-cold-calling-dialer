import { NextRequest, NextResponse } from "next/server";
import { supabaseServiceClient } from "@/lib/supabase";
import { verifyTwilioSignature } from "@/lib/twilio";
import { downloadFile, uploadRecordingToStorage } from "@/lib/storage";

export async function POST(req: NextRequest) {
  const signature = req.headers.get("x-twilio-signature") || "";

  // Parse form data
  const formData = await req.formData();
  const body: Record<string, string> = {};
  formData.forEach((value, key) => {
    body[key] = value as string;
  });

  // Verify Twilio signature
  const url = `${process.env.NEXT_PUBLIC_APP_URL}/api/calls/recording`;
  if (!verifyTwilioSignature(body, signature, url)) {
    return new NextResponse("Signature verification failed", { status: 403 });
  }

  try {
    const callSid = body.CallSid;
    const recordingSid = body.RecordingSid;
    const recordingUrl = body.RecordingUrl;

    if (!recordingUrl) {
      return new NextResponse("No recording URL", { status: 400 });
    }

    // Get call record
    const { data: callRecord, error: getError } = await supabaseServiceClient
      .from("calls")
      .select("*")
      .eq("twilio_call_sid", callSid)
      .single();

    if (getError || !callRecord) {
      return new NextResponse("Call record not found", { status: 404 });
    }

    // Download recording from Twilio
    const mp3Url = `${recordingUrl}.mp3`;
    const recordingData = await downloadFile(mp3Url);

    // Upload to Supabase Storage
    const now = new Date();
    const dateFolder = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}`;
    const storagePath = `recordings/${dateFolder}/call_${callRecord.id}.mp3`;

    const { path, url: storageUrl } = await uploadRecordingToStorage(
      "recordings",
      storagePath,
      recordingData
    );

    // Update call record with recording details
    const expiryDate = new Date(now);
    expiryDate.setDate(expiryDate.getDate() + 90);

    const { error: updateError } = await supabaseServiceClient
      .from("calls")
      .update({
        recording_sid: recordingSid,
        recording_storage_path: path,
        recording_url: storageUrl,
        recording_size_bytes: recordingData.length,
        recording_uploaded_at: new Date().toISOString(),
        recording_expires_at: expiryDate.toISOString(),
      })
      .eq("id", callRecord.id);

    if (updateError) {
      console.error("Update error:", updateError);
      return new NextResponse(`Update failed: ${updateError.message}`, { status: 500 });
    }

    return new NextResponse("OK", { status: 200 });
  } catch (error) {
    console.error("Error:", error);
    return new NextResponse(`Server error: ${error}`, { status: 500 });
  }
}

import { supabaseServiceClient } from "./supabase";

export async function downloadFile(url: string, authHeader?: string): Promise<Buffer> {
  const response = await fetch(url, {
    headers: authHeader ? { Authorization: authHeader } : undefined,
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Failed to download file: ${response.status} ${response.statusText} - ${body.slice(0, 500)}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

const RECORDING_URL_EXPIRY_SECONDS = 60 * 60 * 24 * 90; // matches recording_expires_at retention window

export async function uploadRecordingToStorage(
  bucket: string,
  path: string,
  data: Buffer,
  contentType: string = "audio/mpeg"
): Promise<{ path: string; url: string }> {
  const { data: uploadData, error } = await supabaseServiceClient.storage
    .from(bucket)
    .upload(path, data, { contentType });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  // The bucket is private, so getPublicUrl() would produce a URL that never
  // resolves -- a signed URL is required to actually fetch the file.
  const { data: signedData, error: signError } = await supabaseServiceClient.storage
    .from(bucket)
    .createSignedUrl(uploadData.path, RECORDING_URL_EXPIRY_SECONDS);

  if (signError) throw new Error(`Failed to create signed URL: ${signError.message}`);

  return { path: uploadData.path, url: signedData.signedUrl };
}

export async function getRecordingUrl(bucket: string, path: string): Promise<string> {
  const { data, error } = await supabaseServiceClient.storage
    .from(bucket)
    .createSignedUrl(path, RECORDING_URL_EXPIRY_SECONDS);

  if (error) throw new Error(`Failed to create signed URL: ${error.message}`);

  return data.signedUrl;
}

// Shared by both recording webhook handlers (TeXML phone-bridge calls and
// Call Control WebRTC calls) -- same download/store/record-metadata flow
// regardless of which product generated the recording.
export async function saveRecordingForCall(
  callId: string,
  recordingUrl: string,
  recordingSid: string | null,
  downloadAuthHeader?: string
) {
  const recordingData = await downloadFile(recordingUrl, downloadAuthHeader);

  const now = new Date();
  const dateFolder = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}`;
  const storagePath = `${dateFolder}/call_${callId}.mp3`;

  const { path, url: storageUrl } = await uploadRecordingToStorage("recordings", storagePath, recordingData);

  const expiryDate = new Date(now);
  expiryDate.setDate(expiryDate.getDate() + 90);

  const { error } = await supabaseServiceClient
    .from("calls")
    .update({
      recording_sid: recordingSid,
      recording_storage_path: path,
      recording_url: storageUrl,
      recording_size_bytes: recordingData.length,
      recording_uploaded_at: new Date().toISOString(),
      recording_expires_at: expiryDate.toISOString(),
    })
    .eq("id", callId);

  if (error) throw new Error(`Failed to update call record: ${error.message}`);
}

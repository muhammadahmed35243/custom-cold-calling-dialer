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

  const { data: urlData } = supabaseServiceClient.storage
    .from(bucket)
    .getPublicUrl(path);

  return { path: uploadData.path, url: urlData.publicUrl };
}

export async function getRecordingUrl(bucket: string, path: string): Promise<string> {
  const { data } = supabaseServiceClient.storage
    .from(bucket)
    .getPublicUrl(path);

  return data.publicUrl;
}

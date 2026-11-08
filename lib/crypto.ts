import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

// AES-256-GCM for secrets the app must store (mailbox passwords, Google
// refresh tokens) and for tamper-proof values it hands out (the Google sign-in
// state). The key is MAILBOX_ENCRYPTION_KEY: 32 random bytes, base64. Losing
// or changing it means every connected mailbox has to be connected again.

const PREFIX = "v1:";

function key(): Buffer {
  const raw = process.env.MAILBOX_ENCRYPTION_KEY;
  if (!raw) throw new Error("MAILBOX_ENCRYPTION_KEY is not set");
  const bytes = Buffer.from(raw, "base64");
  if (bytes.length !== 32) throw new Error("MAILBOX_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
  return bytes;
}

export function encryptionReady(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

// Throws if the value was altered or made with another key.
export function decrypt(sealed: string): string {
  if (!sealed.startsWith(PREFIX)) throw new Error("Unknown encrypted format");
  const data = Buffer.from(sealed.slice(PREFIX.length), "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key(), data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8");
}

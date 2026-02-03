import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes
const SHA256_BYTE_LENGTH = 32;

/** Normalize timestamp to milliseconds. Values < 1e12 are treated as seconds. */
function normalizeTimestamp(raw: string): number | null {
  const ts = Number(raw);
  if (Number.isNaN(ts) || ts <= 0) return null;
  return ts < 1e12 ? ts * 1000 : ts;
}

export function verifyWebhookSignature(
  payload: Buffer,
  secret: string,
  signatureHeader: string | undefined,
  timestampHeader: string,
  maxAgeMs = DEFAULT_MAX_AGE_MS,
): boolean {
  if (!signatureHeader || !timestampHeader) return false;

  // Replay protection: reject stale timestamps
  const tsMs = normalizeTimestamp(timestampHeader);
  if (tsMs === null || Math.abs(Date.now() - tsMs) > maxAgeMs) return false;

  // Sign timestamp.payload so timestamp is covered by HMAC
  const baseString = Buffer.concat([
    Buffer.from(`${timestampHeader}.`),
    payload,
  ]);
  const expected = createHmac("sha256", secret).update(baseString).digest();

  // Strict hex decoding — reject malformed signatures
  const raw = signatureHeader.startsWith("sha256=")
    ? signatureHeader.slice(7)
    : signatureHeader;
  const sig = Buffer.from(raw, "hex");
  if (sig.length !== SHA256_BYTE_LENGTH) return false;

  try {
    return timingSafeEqual(expected, sig);
  } catch {
    return false;
  }
}

/**
 * HMAC webhook signature verification service
 *
 * Provides timing-safe HMAC-SHA256 signature verification for incoming
 * webhook payloads from External Systems.
 *
 * Expected header format: `X-Signature-SHA256: sha256=<hex_digest>`
 *
 * Requirements: 12.2
 */

import crypto from 'node:crypto';

/**
 * Verifies the HMAC-SHA256 signature of a raw request body.
 *
 * Uses `crypto.timingSafeEqual` to prevent timing attacks. Both the
 * expected and received signature must have identical byte lengths before
 * comparison is attempted.
 *
 * @param rawBody     - The raw request body as a Buffer
 * @param receivedSig - The value from the `X-Signature-SHA256` header (e.g. `sha256=abc123`)
 * @param secret      - The shared HMAC secret for this source system
 * @returns `true` if the signature is valid, `false` otherwise
 *
 * Requirements: 12.2
 */
export function verifyHmacSignature(
  rawBody: Buffer,
  receivedSig: string,
  secret: string,
): boolean {
  // Compute expected signature: sha256=<hex>
  const expected =
    'sha256=' +
    crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  try {
    // Buffers must be the same byte length for timingSafeEqual
    if (Buffer.byteLength(expected) !== Buffer.byteLength(receivedSig)) {
      return false;
    }
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(receivedSig),
    );
  } catch {
    return false;
  }
}

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Symmetric encryption for at-rest secrets (email account passwords, API keys).
 *
 * Envelope format: `v1:${iv_b64}:${authTag_b64}:${ciphertext_b64}`
 * - AES-256-GCM, 12-byte random IV per encryption, 16-byte auth tag.
 * - Key is derived from `EMAIL_CRED_ENC_KEY` env var — base64-encoded 32 bytes.
 * - Generate a key: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
 *
 * If you rotate the key, bump the version prefix (`v2:`), keep a decrypt-only
 * fallback for the old key, and re-encrypt existing rows offline.
 */

const CURRENT_VERSION = 'v1';
const KEY_BYTES = 32;
const IV_BYTES = 12;

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.EMAIL_CRED_ENC_KEY;
  if (!raw) {
    throw new Error(
      'EMAIL_CRED_ENC_KEY is not set. Generate one: ' +
        "node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    );
  }
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== KEY_BYTES) {
    throw new Error(`EMAIL_CRED_ENC_KEY must decode to ${KEY_BYTES} bytes, got ${buf.length}`);
  }
  cachedKey = buf;
  return buf;
}

export function seal(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    CURRENT_VERSION,
    iv.toString('base64'),
    tag.toString('base64'),
    ct.toString('base64'),
  ].join(':');
}

export function open(envelope: string): string {
  const parts = envelope.split(':');
  if (parts.length !== 4) throw new Error('malformed ciphertext envelope');
  const version = parts[0];
  const ivB64 = parts[1] ?? '';
  const tagB64 = parts[2] ?? '';
  const ctB64 = parts[3] ?? '';
  if (version !== CURRENT_VERSION) {
    throw new Error(`unsupported ciphertext version: ${version}`);
  }
  const key = getKey();
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const ct = Buffer.from(ctB64, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}

/** Reset the cached key — test helper for env var changes. */
export function _resetKeyCache(): void {
  cachedKey = null;
}

/**
 * Upload constants. Kept in a leaf module (no AWS SDK / no env access)
 * so both server code and client-safe schemas can import them without
 * pulling in the S3 pipeline. `presign.ts` re-imports them at
 * upload-signing time.
 */

/** MIME allowlist for candidate/employer uploads. Extend cautiously. */
export const ALLOWED_UPLOAD_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
  'application/msword', // legacy .doc
]);

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

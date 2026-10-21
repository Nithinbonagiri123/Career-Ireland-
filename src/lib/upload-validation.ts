/**
 * Stage B Wave 2.3 — shared client-side upload validation, used by every
 * upload surface (candidate docs tab, onboarding multi-uploader, public
 * magic-link form) so rejections are explained the same way everywhere.
 * Pure module: no server imports.
 */

export const MAX_UPLOAD_MB = 10;

/** Some browsers report an empty `File.type`; infer it from the extension
 *  for the formats we accept, instead of substituting
 *  application/octet-stream (which the server always rejects). */
export function effectiveMimeType(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  const byExt: Record<string, string> = {
    pdf: 'application/pdf',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
  return byExt[ext] ?? 'application/octet-stream';
}

/** Pre-network validation. Returns a user-facing reason the file can't be
 *  uploaded, or null when it is uploadable. */
export function stageProblem(file: File): string | null {
  const name = file.name.toLowerCase();
  const mime = effectiveMimeType(file);
  if (
    name.endsWith('.heic') ||
    name.endsWith('.heif') ||
    mime === 'image/heic' ||
    mime === 'image/heif'
  ) {
    return `${file.name}: iPhone photos are HEIC, which isn't supported — convert it to JPEG (share/export as JPEG) and upload again.`;
  }
  if (
    name.endsWith('.zip') ||
    mime === 'application/zip' ||
    mime === 'application/x-zip-compressed'
  ) {
    return `${file.name}: archives aren't accepted — extract it and upload the files individually.`;
  }
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
    return `${file.name}: larger than the ${MAX_UPLOAD_MB} MB limit (${(file.size / 1024 / 1024).toFixed(1)} MB) — compress or re-scan at lower quality.`;
  }
  if (mime === 'application/octet-stream') {
    return `${file.name}: unrecognised file type — accepted formats are PDF, JPG, PNG, WEBP, DOC and DOCX.`;
  }
  return null;
}

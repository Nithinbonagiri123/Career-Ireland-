import { describe, expect, it } from 'vitest';
import { ALLOWED_UPLOAD_MIME, buildObjectKey, MAX_UPLOAD_BYTES } from './presign';

const OWNER_ID = '3f3d1e5a-2b1e-4c7e-9c0e-1b0a1e2b3c4d';
const TYPE_ID = '11111111-2222-3333-4444-555555555555';

describe('buildObjectKey', () => {
  it('embeds year, month, ownerType, ownerId and documentTypeId', () => {
    const key = buildObjectKey({
      ownerType: 'person',
      ownerId: OWNER_ID,
      documentTypeId: TYPE_ID,
      originalFilename: 'cv.pdf',
    });
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    expect(key.startsWith(`${yyyy}/${mm}/person/${OWNER_ID}/${TYPE_ID}/`)).toBe(true);
    expect(key.endsWith('-cv.pdf')).toBe(true);
  });

  it('supports employer owner type', () => {
    const key = buildObjectKey({
      ownerType: 'employer',
      ownerId: OWNER_ID,
      documentTypeId: TYPE_ID,
      originalFilename: 'contract.pdf',
    });
    expect(key.includes('/employer/')).toBe(true);
  });

  it('replaces unsafe filename characters with underscore', () => {
    const key = buildObjectKey({
      ownerType: 'person',
      ownerId: OWNER_ID,
      documentTypeId: TYPE_ID,
      originalFilename: 'my resume (2026)?.pdf',
    });
    // Whole tail after the UUID is safe (no spaces, quotes, question marks, parens).
    const tail = key.split('/').at(-1) ?? '';
    expect(tail).toMatch(/^[\w.-]+$/);
    expect(tail).toContain('.pdf');
  });

  it('caps very long filenames', () => {
    const longName = `${'a'.repeat(300)}.pdf`;
    const key = buildObjectKey({
      ownerType: 'person',
      ownerId: OWNER_ID,
      documentTypeId: TYPE_ID,
      originalFilename: longName,
    });
    const tail = key.split('/').at(-1) ?? '';
    // UUID (36) + '-' + slice(0,120) = 157
    expect(tail.length).toBeLessThanOrEqual(157);
  });

  it('produces distinct keys for the same filename (UUID)', () => {
    const a = buildObjectKey({
      ownerType: 'person',
      ownerId: OWNER_ID,
      documentTypeId: TYPE_ID,
      originalFilename: 'cv.pdf',
    });
    const b = buildObjectKey({
      ownerType: 'person',
      ownerId: OWNER_ID,
      documentTypeId: TYPE_ID,
      originalFilename: 'cv.pdf',
    });
    expect(a).not.toEqual(b);
  });

  it('collapses runs of unsafe chars into a single underscore', () => {
    const key = buildObjectKey({
      ownerType: 'person',
      ownerId: OWNER_ID,
      documentTypeId: TYPE_ID,
      originalFilename: 'a  b !! c.pdf',
    });
    const tail = key.split('/').at(-1) ?? '';
    // Only ONE underscore per run of unsafe chars.
    expect(tail).toMatch(/a_b_c\.pdf$/);
  });
});

describe('ALLOWED_UPLOAD_MIME', () => {
  it.each([
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
  ])('allows %s', (mime) => {
    expect(ALLOWED_UPLOAD_MIME.has(mime)).toBe(true);
  });

  it.each([
    'application/x-executable',
    'application/x-msdownload',
    'text/html',
    'image/svg+xml', // deliberately excluded — SVG can carry <script>
    'application/octet-stream',
    'application/zip',
    'video/mp4',
    'text/javascript',
    '',
    'application/PDF', // case-sensitive
  ])('rejects %s', (mime) => {
    expect(ALLOWED_UPLOAD_MIME.has(mime)).toBe(false);
  });
});

describe('MAX_UPLOAD_BYTES', () => {
  it('is 10 MB', () => {
    expect(MAX_UPLOAD_BYTES).toBe(10 * 1024 * 1024);
  });
});

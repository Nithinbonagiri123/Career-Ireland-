'use server';

import { revalidatePath } from 'next/cache';
import { toActionResult } from '@/lib/result';
import { registerUploadForToken } from '@/modules/document-upload-requests/service';

/**
 * Public server action called by the candidate's browser after the
 * file lands in S3. Token in the args is the credential — the server
 * revalidates it inside `registerUploadForToken`.
 */
export async function registerUploadForTokenAction(input: {
  token: string;
  requirementId: string;
  s3ObjectKey: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
}) {
  const r = await toActionResult(() => registerUploadForToken(input));
  if (r.ok) {
    revalidatePath(`/upload/${input.token}`);
  }
  return r;
}

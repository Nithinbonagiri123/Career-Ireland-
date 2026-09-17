'use server';

import { revalidatePath } from 'next/cache';
import { toActionResult } from '@/lib/result';
import { issueUploadRequest, revokeUploadRequest } from './service';

export async function issueUploadRequestAction(input: { personId: string }) {
  const r = await toActionResult(() => issueUploadRequest(input));
  if (r.ok) {
    revalidatePath(`/candidates/${input.personId}`);
  }
  return r;
}

export async function revokeUploadRequestAction(input: {
  requestId: string;
  personId: string;
  reason?: string;
}) {
  const r = await toActionResult(() =>
    revokeUploadRequest({ requestId: input.requestId, reason: input.reason }),
  );
  if (r.ok) {
    revalidatePath(`/candidates/${input.personId}`);
  }
  return r;
}

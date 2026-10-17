'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth/session';
import { toActionResult } from '@/lib/result';
import { reactivateExpiredLead } from './expiry';
import type {
  AcceptLeadInput,
  ArchiveLeadInput,
  CreateLeadInput,
  UnarchiveLeadInput,
  UpdateLeadStatusInput,
} from './schemas';
import { acceptLead, archiveLead, createLead, unarchiveLead, updateLeadStatus } from './service';

const revalidate = () => {
  revalidatePath('/leads');
  revalidatePath('/candidates');
  revalidatePath('/immigration');
  revalidatePath('/requisitions');
};

export async function createLeadAction(input: CreateLeadInput) {
  const result = await toActionResult(() => createLead(input));
  if (result.ok) revalidate();
  return result;
}

export async function updateLeadStatusAction(input: UpdateLeadStatusInput) {
  const result = await toActionResult(() => updateLeadStatus(input));
  if (result.ok) revalidate();
  return result;
}

export async function acceptLeadAction(input: AcceptLeadInput) {
  const result = await toActionResult(() => acceptLead(input));
  if (result.ok) revalidate();
  return result;
}

export async function archiveLeadAction(input: ArchiveLeadInput) {
  const result = await toActionResult(() => archiveLead(input));
  if (result.ok) revalidate();
  return result;
}

export async function unarchiveLeadAction(input: UnarchiveLeadInput) {
  const result = await toActionResult(() => unarchiveLead(input));
  if (result.ok) revalidate();
  return result;
}

/**
 * Reactivate an EXPIRED lead. Admin / Finance only — this undoes an
 * automatic sweep decision and must stay auditable. Reason is
 * required and recorded on the audit event.
 */
export async function reactivateExpiredLeadAction(input: { leadId: string; reason: string }) {
  const session = await requireRole(['ADMIN', 'MANAGER', 'FINANCE']);
  const result = await toActionResult(() =>
    reactivateExpiredLead({
      leadId: input.leadId,
      actorUserId: session.user.id,
      reason: input.reason,
    }),
  );
  if (result.ok) revalidate();
  return result;
}

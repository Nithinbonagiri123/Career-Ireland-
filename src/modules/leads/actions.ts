'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { toActionResult } from '@/lib/result';
import { expireLeads, fetchExpirableLeadIds, reactivateExpiredLead } from './expiry';
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

/**
 * Admin-only manual sweep. Mirrors the cron endpoint for operators
 * who want to run expiry on demand (QA, debugging, catching up after
 * a cron outage). `dryRun` returns the eligible set without flipping
 * anything.
 */
export async function runLeadExpirySweepAction(input: { dryRun?: boolean }) {
  const session = await requireRole(['ADMIN']);
  const result = await toActionResult(async () => {
    if (input.dryRun) {
      const ids = await fetchExpirableLeadIds(db, {});
      return { dryRun: true as const, eligibleCount: ids.length, eligibleIds: ids };
    }
    const r = await expireLeads({ actorUserId: session.user.id });
    return {
      dryRun: false as const,
      expiredCount: r.expiredIds.length,
      skippedCount: r.skippedIds.length,
      expiredIds: r.expiredIds,
    };
  });
  if (result.ok) revalidate();
  return result;
}

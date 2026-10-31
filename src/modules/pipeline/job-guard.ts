import { eq } from 'drizzle-orm';
import type { DbExecutor } from '@/lib/audit/withAudit';
import { jobRequisitions } from '@/lib/db/schema/recruitment';
import { BusinessRuleError } from '@/lib/errors';

/**
 * P0 — one rule for "may this job take pipeline work right now?", shared
 * by every write that adds, moves or places a candidate on a job
 * (createApplication, updateApplicationStatus, markApplicationPlaced,
 * createPlacement, PROPOSED→CONFIRMED, manual add, shortlist a match).
 *
 *   add / move — refused on archived, DRAFT, CLOSED, CANCELLED and FILLED
 *                jobs (a FILLED job has no seat left to work towards).
 *   place      — refused on archived, DRAFT, CLOSED and CANCELLED jobs.
 *                FILLED is left to the seat guard so the refusal names the
 *                capacity ("All 2 position(s) … are already filled").
 *   close_out  — rejecting / withdrawing a candidate. Allowed on every
 *                non-archived job so recruiters can still tidy up the
 *                remaining candidates after a job fills or closes.
 *
 * Pure so the UI can show the same reason inline instead of a failing
 * button (see `jobPipelineBlock`).
 */

export type JobWorkKind = 'add' | 'move' | 'place' | 'close_out';

export type JobGuardInput = {
  status: string;
  archivedAt: Date | string | null;
};

export const JOB_NOT_ACTIVE = 'REQUISITION_NOT_ACTIVE';

export const DRAFT_JOB_MESSAGE = 'Open this job before adding or moving candidates.';

export function jobPipelineBlock(job: JobGuardInput, kind: JobWorkKind): string | null {
  if (job.archivedAt) {
    return 'This job is archived — restore it before adding, moving or placing candidates.';
  }
  if (kind === 'close_out') return null;
  if (job.status === 'DRAFT') {
    return kind === 'place' ? 'Open this job before placing candidates.' : DRAFT_JOB_MESSAGE;
  }
  if (job.status === 'CLOSED' || job.status === 'CANCELLED') {
    return `This job is ${job.status.toLowerCase()} — candidates can no longer be added, moved or placed. Its history is kept.`;
  }
  if (job.status === 'FILLED' && kind !== 'place') {
    return 'All positions on this job are filled — candidates can no longer be added or moved. Increase the positions to keep recruiting.';
  }
  return null;
}

export function assertJobAcceptsPipelineWork(job: JobGuardInput, kind: JobWorkKind): void {
  const reason = jobPipelineBlock(job, kind);
  if (reason) throw new BusinessRuleError(JOB_NOT_ACTIVE, reason);
}

/**
 * Locks the job row for the rest of the transaction (so a concurrent
 * close/archive waits) and applies the rule. Returns the row.
 */
export async function lockJobForPipelineWork(
  tx: DbExecutor,
  requisitionId: string,
  kind: JobWorkKind,
) {
  const [job] = await tx
    .select()
    .from(jobRequisitions)
    .where(eq(jobRequisitions.id, requisitionId))
    .for('update')
    .limit(1);
  if (!job) throw new BusinessRuleError('REQUISITION_NOT_FOUND', 'Requisition not found');
  assertJobAcceptsPipelineWork(job, kind);
  return job;
}

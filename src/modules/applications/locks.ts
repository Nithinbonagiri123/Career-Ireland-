import { eq } from 'drizzle-orm';
import type { DbExecutor } from '@/lib/audit/withAudit';
import { employers, jobApplications, jobRequisitions } from '@/lib/db/schema/recruitment';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';

/**
 * R3 — lock a requisition application row for the rest of the transaction
 * and return it with its requisition + employer. Interview and offer writes
 * take this lock first, so concurrent or double-submitted actions on the
 * same application run one after another (duplicate prevention without a
 * schema change). External applications (no requisition) are refused —
 * interviews and offers are managed inside a job requirement.
 */
export async function lockRequisitionApplication(tx: DbExecutor, applicationId: string) {
  const [row] = await tx
    .select({
      id: jobApplications.id,
      personId: jobApplications.personId,
      status: jobApplications.status,
      jobRequisitionId: jobApplications.jobRequisitionId,
      requisitionStatus: jobRequisitions.status,
      requisitionTitle: jobRequisitions.title,
      employerId: jobRequisitions.employerId,
      employerName: employers.legalName,
    })
    .from(jobApplications)
    .leftJoin(jobRequisitions, eq(jobRequisitions.id, jobApplications.jobRequisitionId))
    .leftJoin(employers, eq(employers.id, jobRequisitions.employerId))
    .where(eq(jobApplications.id, applicationId))
    .for('update', { of: jobApplications })
    .limit(1);
  if (!row) throw new NotFoundError('Application');
  if (!row.jobRequisitionId || !row.requisitionStatus || !row.employerId) {
    throw new BusinessRuleError(
      'APPLICATION_NOT_ON_REQUISITION',
      'Interviews and offers are managed for applications to one of our job requirements.',
    );
  }
  return {
    ...row,
    jobRequisitionId: row.jobRequisitionId,
    requisitionStatus: row.requisitionStatus,
    employerId: row.employerId,
  };
}

export function assertRequisitionOpen(status: string): void {
  if (status === 'CLOSED' || status === 'CANCELLED' || status === 'DRAFT') {
    throw new BusinessRuleError(
      'REQUISITION_NOT_ACTIVE',
      status === 'DRAFT'
        ? 'Open this job requirement before scheduling interviews or making offers.'
        : 'This job requirement is closed — interviews and offers can no longer be added.',
    );
  }
}

import { and, eq, isNull } from 'drizzle-orm';
import type { CaseDialogPrefill } from '@/app/(app)/immigration/case-dialog';
import { requireInternalStaff } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { jobRequisitions, placements } from '@/lib/db/schema/recruitment';

/**
 * Resolves the /immigration ?raise* deep-link query params into a
 * CaseDialogPrefill. Every field is filled from the DB — the client
 * dialog just consumes the resulting shape.
 *
 * Precedence:
 *  - raisePlacement is the richest source (fills beneficiary + sponsor
 *    + related placement + related requisition all in one lookup)
 *  - raiseRequisition falls back to sponsor + requisition only
 *    (no beneficiary — the operator picks the candidate)
 *  - raisePerson only pins the beneficiary
 *
 * Returns undefined if no param is present or none resolves — the page
 * then renders the normal "Open case" trigger with no auto-open.
 */
export async function resolveRaiseCasePrefill(opts: {
  personId?: string;
  placementId?: string;
  requisitionId?: string;
}): Promise<CaseDialogPrefill | undefined> {
  const { personId, placementId, requisitionId } = opts;
  if (!personId && !placementId && !requisitionId) return undefined;
  await requireInternalStaff();

  if (placementId) {
    const [row] = await db
      .select({
        personId: placements.personId,
        employerId: placements.employerId,
        jobRequisitionId: placements.jobRequisitionId,
      })
      .from(placements)
      .where(and(eq(placements.id, placementId), isNull(placements.archivedAt)))
      .limit(1);
    if (row) {
      return {
        beneficiaryPersonId: row.personId,
        sponsorEmployerId: row.employerId,
        relatedPlacementId: placementId,
        relatedJobRequisitionId: row.jobRequisitionId,
      };
    }
  }

  if (requisitionId) {
    const [row] = await db
      .select({ employerId: jobRequisitions.employerId })
      .from(jobRequisitions)
      .where(and(eq(jobRequisitions.id, requisitionId), isNull(jobRequisitions.archivedAt)))
      .limit(1);
    if (row) {
      return {
        sponsorEmployerId: row.employerId,
        relatedJobRequisitionId: requisitionId,
      };
    }
  }

  if (personId) {
    return { beneficiaryPersonId: personId };
  }

  return undefined;
}

import type { ImmigrationCase } from '@/lib/db/schema/immigration';

/**
 * Spec-aligned display labels for the immigration case stages. The DB enum
 * (OPEN / DOCUMENTS_PENDING / SUBMITTED / UNDER_AUTHORITY_REVIEW / APPROVED
 * / REJECTED / CLOSED) stays authoritative — reporting, transitions, and
 * indexes all key off it — but the UI reads the friendlier names from the
 * workflow spec: New Candidate → Document Collection → Application In
 * Progress → Approved / Rejected. Two DB statuses (SUBMITTED,
 * UNDER_AUTHORITY_REVIEW) both display as "Application In Progress" because
 * from the operator's point of view they're one bucket.
 *
 * Use CASE_STAGE_LABEL wherever a status renders in the UI. Do NOT rename the
 * enum values — the schema/migration hop isn't worth it and would break every
 * existing test.
 */
export const CASE_STAGE_LABEL: Record<ImmigrationCase['status'], string> = {
  OPEN: 'New Candidate',
  DOCUMENTS_PENDING: 'Document Collection',
  SUBMITTED: 'Application In Progress',
  UNDER_AUTHORITY_REVIEW: 'Application In Progress',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CLOSED: 'Closed',
};

export const CASE_TYPE_LABEL: Record<ImmigrationCase['caseType'], string> = {
  EMPLOYMENT_PERMIT: 'Employment Permit',
  VISA: 'Visa',
  VISA_EXTENSION: 'Visa Extension',
};

import { requireInternalStaff, requirePermission } from '@/lib/auth/session';

/**
 * R6 — server-side permission checks for Recruitment writes, using the
 * existing recruitment.* permission modules (owner / ADMIN bypass as
 * everywhere). Reads keep their existing internal-staff rule.
 */
export type RecruitmentModule = 'employers' | 'requisitions' | 'placements' | 'leads' | 'campaigns';

export function requireRecruitment(module: RecruitmentModule, verb: 'create' | 'edit' | 'delete') {
  return requirePermission('recruitment', module, verb);
}

/** create when there is no id yet, edit otherwise. */
export function createOrEdit(input: unknown): 'create' | 'edit' {
  const id = (input as { id?: unknown } | null)?.id;
  return typeof id === 'string' && id.length > 0 ? 'edit' : 'create';
}

/**
 * Tasks and communications follow the record they belong to: a job, a
 * campaign advertisement or an employer needs that Recruitment permission.
 * Anything else (candidate notes, immigration, engagements, personal to-dos)
 * keeps the existing internal-staff rule (Stage B Wave 3: any staff member
 * can add a candidate note).
 */
export function requireLinkedRecordWrite(link: {
  jobRequisitionId?: string | null;
  advertisementId?: string | null;
  employerId?: string | null;
}) {
  if (link.jobRequisitionId) return requireRecruitment('requisitions', 'edit');
  if (link.advertisementId) return requireRecruitment('campaigns', 'edit');
  if (link.employerId) return requireRecruitment('employers', 'edit');
  return requireInternalStaff();
}

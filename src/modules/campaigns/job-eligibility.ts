/**
 * P0 (owner decision 7) — the one "can this job be advertised?" rule.
 *
 * Used by the campaign job picker, by saveCampaign (create, or when the
 * job changes) and by transitionCampaign (→ ACTIVE, including resume).
 * Pure data + a pure function, so client components can import it too.
 *
 * A job can be advertised when it is not archived, its employer is not
 * archived, and its status is OPEN, IN_PROGRESS or PARTIALLY_FILLED.
 * DRAFT is deliberately excluded (even for a draft campaign): a draft job
 * has not been agreed with the employer yet, and one rule everywhere is
 * easier to explain than "allowed now, refused at activation". The
 * recruiter opens the job first (one status change).
 *
 * Existing campaigns on jobs that later became ineligible still open and
 * display normally; they just cannot be (re)activated or re-pointed.
 */

export const CAMPAIGNABLE_JOB_STATUSES = ['OPEN', 'IN_PROGRESS', 'PARTIALLY_FILLED'] as const;

export type JobEligibilityInput = {
  status: string;
  archivedAt?: Date | string | null;
  employerArchivedAt?: Date | string | null;
};

export type JobIneligibility = {
  /** CAMPAIGN_JOB_CLOSED for closed / cancelled, CAMPAIGN_JOB_NOT_ADVERTISABLE otherwise. */
  code: 'CAMPAIGN_JOB_CLOSED' | 'CAMPAIGN_JOB_NOT_ADVERTISABLE';
  /** Short reason, e.g. "filled". */
  reason: string;
};

export function jobIneligibility(job: JobEligibilityInput): JobIneligibility | null {
  if (job.archivedAt) return { code: 'CAMPAIGN_JOB_NOT_ADVERTISABLE', reason: 'archived' };
  if (job.employerArchivedAt) {
    return { code: 'CAMPAIGN_JOB_NOT_ADVERTISABLE', reason: 'for an archived employer' };
  }
  if ((CAMPAIGNABLE_JOB_STATUSES as readonly string[]).includes(job.status)) return null;
  switch (job.status) {
    case 'CLOSED':
      return { code: 'CAMPAIGN_JOB_CLOSED', reason: 'closed' };
    case 'CANCELLED':
      return { code: 'CAMPAIGN_JOB_CLOSED', reason: 'cancelled' };
    case 'FILLED':
      return { code: 'CAMPAIGN_JOB_NOT_ADVERTISABLE', reason: 'filled' };
    case 'DRAFT':
      return { code: 'CAMPAIGN_JOB_NOT_ADVERTISABLE', reason: 'still a draft' };
    default:
      return { code: 'CAMPAIGN_JOB_NOT_ADVERTISABLE', reason: 'not open' };
  }
}

export function isJobAdvertisable(job: JobEligibilityInput): boolean {
  return jobIneligibility(job) === null;
}

/** "That job is filled — campaigns can only target open jobs." */
export function jobIneligibleMessage(reason: string): string {
  return reason === 'still a draft'
    ? 'That job is still a draft — open the job before advertising it'
    : `That job is ${reason} — campaigns can only target open jobs`;
}

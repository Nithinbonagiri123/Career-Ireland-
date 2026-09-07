import { and, eq, gt, isNull, ne, sql } from 'drizzle-orm';
import { requireInternalStaff } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { immigrationCases } from '@/lib/db/schema/immigration';
import { leads } from '@/lib/db/schema/leads';
import { persons } from '@/lib/db/schema/persons';
import { jobApplications, jobRequisitions, placements } from '@/lib/db/schema/recruitment';

/**
 * Pipeline funnels for the operational command centre. Each function
 * returns a fixed-order list of `{ label, count }` stages so the UI
 * can render a straight funnel without worrying about ordering or
 * missing states. All counts respect the same filters we use in list
 * views (draft/archived/merged persons excluded, archived leads
 * excluded, etc.) so the dashboard never lies.
 */

export type PipelineStage = {
  label: string;
  count: number;
};

export type DashboardPipelines = {
  candidate: PipelineStage[];
  requisition: PipelineStage[];
  application: PipelineStage[];
  immigration: PipelineStage[];
};

export async function fetchDashboardPipelines(): Promise<DashboardPipelines> {
  await requireInternalStaff();

  const [
    leadOpen,
    leadAwaitingPayment,
    candidateAvailable,
    candidatePlaced,
    reqDraft,
    reqOpen,
    reqInProgress,
    reqPartial,
    reqFilled,
    appApplied,
    appReviewing,
    appShortlisted,
    appInterview,
    appOffered,
    appAccepted,
    immOpen,
    immSubmitted,
    immApproved,
    immExpired,
  ] = await Promise.all([
    // ─── Candidate journey ─────────────────────────────────────────
    db
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(leads)
      .where(and(isNull(leads.archivedAt), ne(leads.status, 'CONVERTED')))
      .then((r) => r[0]?.n ?? 0),
    db
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(leads)
      .where(and(isNull(leads.archivedAt), eq(leads.status, 'AWAITING_PAYMENT')))
      .then((r) => r[0]?.n ?? 0),
    db
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(persons)
      .where(
        and(
          eq(persons.isDraft, false),
          isNull(persons.archivedAt),
          isNull(persons.mergedIntoPersonId),
        ),
      )
      .then((r) => r[0]?.n ?? 0),
    db
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(placements)
      .where(sql`${placements.status} IN ('CONFIRMED','STARTED')`)
      .then((r) => r[0]?.n ?? 0),
    // ─── Requisition status distribution ───────────────────────────
    db
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(jobRequisitions)
      .where(eq(jobRequisitions.status, 'DRAFT'))
      .then((r) => r[0]?.n ?? 0),
    db
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(jobRequisitions)
      .where(eq(jobRequisitions.status, 'OPEN'))
      .then((r) => r[0]?.n ?? 0),
    db
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(jobRequisitions)
      .where(eq(jobRequisitions.status, 'IN_PROGRESS'))
      .then((r) => r[0]?.n ?? 0),
    db
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(jobRequisitions)
      .where(eq(jobRequisitions.status, 'PARTIALLY_FILLED'))
      .then((r) => r[0]?.n ?? 0),
    db
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(jobRequisitions)
      .where(eq(jobRequisitions.status, 'FILLED'))
      .then((r) => r[0]?.n ?? 0),
    // ─── Application funnel ────────────────────────────────────────
    db
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(jobApplications)
      .where(eq(jobApplications.status, 'APPLIED'))
      .then((r) => r[0]?.n ?? 0),
    db
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(jobApplications)
      .where(eq(jobApplications.status, 'UNDER_REVIEW'))
      .then((r) => r[0]?.n ?? 0),
    db
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(jobApplications)
      .where(eq(jobApplications.status, 'SHORTLISTED'))
      .then((r) => r[0]?.n ?? 0),
    db
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(jobApplications)
      .where(eq(jobApplications.status, 'INTERVIEW'))
      .then((r) => r[0]?.n ?? 0),
    db
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(jobApplications)
      .where(eq(jobApplications.status, 'OFFER'))
      .then((r) => r[0]?.n ?? 0),
    db
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(jobApplications)
      .where(eq(jobApplications.status, 'ACCEPTED'))
      .then((r) => r[0]?.n ?? 0),
    // ─── Immigration cases ─────────────────────────────────────────
    db
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(immigrationCases)
      .where(and(isNull(immigrationCases.archivedAt), eq(immigrationCases.status, 'OPEN')))
      .then((r) => r[0]?.n ?? 0),
    db
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(immigrationCases)
      .where(
        and(
          isNull(immigrationCases.archivedAt),
          sql`${immigrationCases.status} IN ('SUBMITTED','UNDER_AUTHORITY_REVIEW')`,
        ),
      )
      .then((r) => r[0]?.n ?? 0),
    db
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(immigrationCases)
      .where(and(isNull(immigrationCases.archivedAt), eq(immigrationCases.status, 'APPROVED')))
      .then((r) => r[0]?.n ?? 0),
    db
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(immigrationCases)
      .where(
        and(isNull(immigrationCases.archivedAt), gt(sql`NOW()::date`, immigrationCases.expiresOn)),
      )
      .then((r) => r[0]?.n ?? 0),
  ]);

  return {
    candidate: [
      { label: 'Leads', count: leadOpen },
      { label: 'Awaiting payment', count: leadAwaitingPayment },
      { label: 'Active', count: candidateAvailable },
      { label: 'Placed', count: candidatePlaced },
    ],
    requisition: [
      { label: 'Draft', count: reqDraft },
      { label: 'Open', count: reqOpen },
      { label: 'In progress', count: reqInProgress },
      { label: 'Partial', count: reqPartial },
      { label: 'Filled', count: reqFilled },
    ],
    application: [
      { label: 'Applied', count: appApplied },
      { label: 'Reviewing', count: appReviewing },
      { label: 'Shortlisted', count: appShortlisted },
      { label: 'Interview', count: appInterview },
      { label: 'Offer', count: appOffered },
      { label: 'Accepted', count: appAccepted },
    ],
    immigration: [
      { label: 'Open', count: immOpen },
      { label: 'Submitted', count: immSubmitted },
      { label: 'Approved', count: immApproved },
      { label: 'Expired', count: immExpired },
    ],
  };
}

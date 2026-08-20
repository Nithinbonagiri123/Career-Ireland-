import { and, desc, eq, sql } from 'drizzle-orm';
import { recordAudit } from '@/lib/audit/withAudit';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { persons } from '@/lib/db/schema/persons';
import {
  type JobApplication,
  jobApplications,
  jobRequisitions,
  placements,
  shortlistEntries,
} from '@/lib/db/schema/recruitment';
import { BusinessRuleError, ValidationError } from '@/lib/errors';
import {
  type CreateApplicationInput,
  CreateApplicationSchema,
  type UpdateApplicationStatusInput,
  UpdateApplicationStatusSchema,
} from './schemas';

export type ApplicationListRow = JobApplication & {
  personName: string;
  requisitionTitle: string;
};

export async function listApplicationsForRequisition(
  requisitionId: string,
): Promise<ApplicationListRow[]> {
  await requireRole(['ADMIN', 'STAFF']);
  const rows = await db
    .select({
      app: jobApplications,
      firstName: persons.firstName,
      lastName: persons.lastName,
      title: jobRequisitions.title,
    })
    .from(jobApplications)
    .innerJoin(persons, eq(persons.id, jobApplications.personId))
    .innerJoin(jobRequisitions, eq(jobRequisitions.id, jobApplications.jobRequisitionId))
    .where(eq(jobApplications.jobRequisitionId, requisitionId))
    .orderBy(desc(jobApplications.appliedAt));
  return rows.map((r) => ({
    ...r.app,
    personName: `${r.firstName} ${r.lastName}`,
    requisitionTitle: r.title,
  }));
}

export type ShortlistPromotionCandidate = {
  personId: string;
  personName: string;
  personEmail: string | null;
  shortlistEntryId: string;
  alreadyApplied: boolean;
};

/** Shortlisted persons for a requisition that don't yet have a JobApplication — ready to promote. */
export async function listShortlistPromotionCandidates(
  requisitionId: string,
): Promise<ShortlistPromotionCandidate[]> {
  await requireRole(['ADMIN', 'STAFF']);
  const rows = await db
    .select({
      shortlistEntryId: shortlistEntries.id,
      personId: shortlistEntries.personId,
      firstName: persons.firstName,
      lastName: persons.lastName,
      email: persons.email,
    })
    .from(shortlistEntries)
    .innerJoin(persons, eq(persons.id, shortlistEntries.personId))
    .where(eq(shortlistEntries.jobRequisitionId, requisitionId));

  if (rows.length === 0) return [];

  const applied = await db
    .select({ personId: jobApplications.personId })
    .from(jobApplications)
    .where(eq(jobApplications.jobRequisitionId, requisitionId));
  const appliedSet = new Set(applied.map((a) => a.personId));

  return rows.map((r) => ({
    personId: r.personId,
    personName: `${r.firstName} ${r.lastName}`,
    personEmail: r.email,
    shortlistEntryId: r.shortlistEntryId,
    alreadyApplied: appliedSet.has(r.personId),
  }));
}

export async function createApplication(input: CreateApplicationInput): Promise<JobApplication> {
  const session = await requireRole(['ADMIN', 'STAFF']);
  const parsed = CreateApplicationSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid application',
      parsed.error.flatten().fieldErrors as Record<string, string>,
    );
  }
  const d = parsed.data;

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(jobApplications)
      .where(
        and(
          eq(jobApplications.jobRequisitionId, d.jobRequisitionId),
          eq(jobApplications.personId, d.personId),
        ),
      )
      .limit(1);
    if (existing) {
      throw new BusinessRuleError(
        'APPLICATION_EXISTS',
        'This person has already applied for this requisition',
      );
    }
    const [created] = await tx
      .insert(jobApplications)
      .values({
        jobRequisitionId: d.jobRequisitionId,
        personId: d.personId,
        status: 'APPLIED',
        appliedAt: new Date(),
      })
      .returning();
    if (!created) throw new Error('insert returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'job_application',
      entityId: created.id,
      action: 'CREATED',
      after: {
        jobRequisitionId: created.jobRequisitionId,
        personId: created.personId,
        status: created.status,
      },
    });
    return created;
  });
}

export async function updateApplicationStatus(
  input: UpdateApplicationStatusInput,
): Promise<JobApplication> {
  const session = await requireRole(['ADMIN', 'STAFF']);
  const parsed = UpdateApplicationStatusSchema.parse(input);

  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(jobApplications)
      .where(eq(jobApplications.id, parsed.applicationId))
      .limit(1);
    if (!before) throw new BusinessRuleError('APPLICATION_NOT_FOUND', 'Application not found');
    if (before.status === parsed.status) return before;

    // Terminal states can only move to WITHDRAWN
    if (
      (before.status === 'ACCEPTED' || before.status === 'REJECTED') &&
      parsed.status !== 'WITHDRAWN'
    ) {
      throw new BusinessRuleError(
        'APPLICATION_TERMINAL',
        `Cannot transition from ${before.status} to ${parsed.status}`,
      );
    }

    const [after] = await tx
      .update(jobApplications)
      .set({
        status: parsed.status,
        rejectionReason: parsed.status === 'REJECTED' ? (parsed.rejectionReason ?? null) : null,
        updatedAt: sql`NOW()`,
      })
      .where(eq(jobApplications.id, parsed.applicationId))
      .returning();
    if (!after) throw new Error('update returned no row');

    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'job_application',
      entityId: after.id,
      action: 'STATUS_CHANGED',
      before: { status: before.status },
      after: { status: after.status },
      context:
        parsed.status === 'REJECTED' && parsed.rejectionReason
          ? { rejectionReason: parsed.rejectionReason }
          : undefined,
    });

    // ACCEPTED → auto-create a Placement in PROPOSED (staff confirms with details later).
    // Idempotent: skip if a placement already exists for this application.
    if (parsed.status === 'ACCEPTED') {
      const [existingPlacement] = await tx
        .select({ id: placements.id })
        .from(placements)
        .where(eq(placements.jobApplicationId, after.id))
        .limit(1);
      if (!existingPlacement) {
        const [req] = await tx
          .select({ employerId: jobRequisitions.employerId })
          .from(jobRequisitions)
          .where(eq(jobRequisitions.id, after.jobRequisitionId))
          .limit(1);
        if (req) {
          const [placement] = await tx
            .insert(placements)
            .values({
              personId: after.personId,
              employerId: req.employerId,
              jobRequisitionId: after.jobRequisitionId,
              jobApplicationId: after.id,
              status: 'PROPOSED',
            })
            .returning();
          if (placement) {
            await recordAudit(tx, {
              actorUserId: session.user.id,
              entityType: 'placement',
              entityId: placement.id,
              action: 'CREATED',
              after: { status: 'PROPOSED' },
              context: { via: 'application_accepted', applicationId: after.id },
            });
          }
        }
      }
    }

    return after;
  });
}

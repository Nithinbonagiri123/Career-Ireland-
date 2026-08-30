import { and, desc, eq, sql } from 'drizzle-orm';
import { recordAudit } from '@/lib/audit/withAudit';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { documentInstances } from '@/lib/db/schema/documents';
import { persons } from '@/lib/db/schema/persons';
import {
  type JobApplication,
  jobApplications,
  jobRequisitions,
  placements,
  shortlistEntries,
} from '@/lib/db/schema/recruitment';
import { BusinessRuleError, ValidationError } from '@/lib/errors';
import { APPLICATION_TRANSITIONS, assertTransition } from '@/lib/state-machine';
import {
  type CreateApplicationInput,
  CreateApplicationSchema,
  type CreateExternalApplicationInput,
  CreateExternalApplicationSchema,
  type UpdateApplicationStatusInput,
  UpdateApplicationStatusSchema,
} from './schemas';

function blankToNull(v: string | undefined | null): string | null {
  return v && v.trim().length > 0 ? v : null;
}

export type ApplicationListRow = JobApplication & {
  personName: string;
  requisitionTitle: string;
};

export type ApplicationDetail = JobApplication & {
  personName: string;
  personEmail: string | null;
  requisitionTitle: string | null;
  requisitionEmployerId: string | null;
  cvDocument: {
    id: string;
    originalFilename: string;
    version: number;
  } | null;
};

export async function fetchApplication(id: string): Promise<ApplicationDetail | null> {
  await requireRole(['ADMIN', 'STAFF']);
  const [row] = await db
    .select({
      app: jobApplications,
      firstName: persons.firstName,
      lastName: persons.lastName,
      personEmail: persons.email,
      requisitionTitle: jobRequisitions.title,
      requisitionEmployerId: jobRequisitions.employerId,
      cvId: documentInstances.id,
      cvFilename: documentInstances.originalFilename,
      cvVersion: documentInstances.version,
    })
    .from(jobApplications)
    .innerJoin(persons, eq(persons.id, jobApplications.personId))
    .leftJoin(jobRequisitions, eq(jobRequisitions.id, jobApplications.jobRequisitionId))
    .leftJoin(documentInstances, eq(documentInstances.id, jobApplications.cvDocumentInstanceId))
    .where(eq(jobApplications.id, id))
    .limit(1);
  if (!row) return null;
  return {
    ...row.app,
    personName: `${row.firstName} ${row.lastName}`,
    personEmail: row.personEmail,
    requisitionTitle: row.requisitionTitle,
    requisitionEmployerId: row.requisitionEmployerId,
    cvDocument: row.cvId
      ? {
          id: row.cvId,
          originalFilename: row.cvFilename ?? 'CV',
          version: row.cvVersion ?? 1,
        }
      : null,
  };
}

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
        source: 'INTERNAL',
        status: 'APPLIED',
        appliedAt: new Date(),
        cvDocumentInstanceId: blankToNull(d.cvDocumentInstanceId ?? undefined),
        notes: blankToNull(d.notes ?? undefined),
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

/**
 * Create an application against an external job board (IrishJobs, Indeed, JobsIreland, …).
 * Deduplicates by (person, source, external company, external reference) if a reference is provided.
 */
export async function createExternalApplication(
  input: CreateExternalApplicationInput,
): Promise<JobApplication> {
  const session = await requireRole(['ADMIN', 'STAFF']);
  const parsed = CreateExternalApplicationSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid external application',
      parsed.error.flatten().fieldErrors as Record<string, string>,
    );
  }
  const d = parsed.data;

  return db.transaction(async (tx) => {
    const ref = blankToNull(d.externalJobReference ?? undefined);
    if (ref) {
      const [dup] = await tx
        .select({ id: jobApplications.id })
        .from(jobApplications)
        .where(
          and(
            eq(jobApplications.personId, d.personId),
            eq(jobApplications.source, d.source),
            eq(jobApplications.externalJobReference, ref),
          ),
        )
        .limit(1);
      if (dup) {
        throw new BusinessRuleError(
          'APPLICATION_EXISTS',
          'This person has already applied to this external job reference',
        );
      }
    }

    const appliedAt = d.appliedAt && d.appliedAt.length > 0 ? new Date(d.appliedAt) : new Date();

    const [created] = await tx
      .insert(jobApplications)
      .values({
        jobRequisitionId: null,
        personId: d.personId,
        source: d.source,
        externalJobUrl: blankToNull(d.externalJobUrl ?? undefined),
        externalCompanyName: d.externalCompanyName,
        externalJobTitle: blankToNull(d.externalJobTitle ?? undefined),
        externalJobReference: ref,
        cvDocumentInstanceId: blankToNull(d.cvDocumentInstanceId ?? undefined),
        notes: blankToNull(d.notes ?? undefined),
        status: 'APPLIED',
        appliedAt,
      })
      .returning();
    if (!created) throw new Error('insert returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'job_application',
      entityId: created.id,
      action: 'CREATED',
      after: {
        source: created.source,
        personId: created.personId,
        externalCompanyName: created.externalCompanyName,
        status: created.status,
      },
      context: { external: true },
    });
    return created;
  });
}

export type CandidateApplicationRow = JobApplication & {
  requisitionTitle: string | null;
  displayCompany: string | null;
};

/** All applications belonging to a person — internal (with requisition title) and external. */
export async function listApplicationsForPerson(
  personId: string,
): Promise<CandidateApplicationRow[]> {
  await requireRole(['ADMIN', 'STAFF']);
  const rows = await db
    .select({
      app: jobApplications,
      requisitionTitle: jobRequisitions.title,
      employerName: sql<string | null>`NULL`,
    })
    .from(jobApplications)
    .leftJoin(jobRequisitions, eq(jobRequisitions.id, jobApplications.jobRequisitionId))
    .where(eq(jobApplications.personId, personId))
    .orderBy(desc(jobApplications.appliedAt));
  return rows.map((r) => ({
    ...r.app,
    requisitionTitle: r.requisitionTitle,
    displayCompany: r.app.externalCompanyName,
  }));
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

    assertTransition('application', before.status, parsed.status, APPLICATION_TRANSITIONS);

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
    // Only for INTERNAL applications with a requisition — external offers don't materialise placements automatically.
    if (parsed.status === 'ACCEPTED' && after.jobRequisitionId) {
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

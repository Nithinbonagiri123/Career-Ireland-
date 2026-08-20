import { desc, eq, sql } from 'drizzle-orm';
import { recordAudit } from '@/lib/audit/withAudit';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { candidateProfiles, persons } from '@/lib/db/schema/persons';
import {
  employers,
  jobRequisitions,
  type Placement,
  placements,
} from '@/lib/db/schema/recruitment';
import { BusinessRuleError, ValidationError } from '@/lib/errors';
import {
  type CreatePlacementInput,
  CreatePlacementSchema,
  type RestoreAvailabilityInput,
  RestoreAvailabilitySchema,
  type UpdatePlacementStatusInput,
  UpdatePlacementStatusSchema,
} from './schemas';

function blankToNull(v: string | undefined | null): string | null {
  return v && v.trim().length > 0 ? v : null;
}

export type PlacementListRow = Placement & {
  personName: string;
  employerName: string;
  requisitionTitle: string;
};

export async function fetchPlacements(): Promise<PlacementListRow[]> {
  await requireRole(['ADMIN', 'STAFF']);
  const rows = await db
    .select({
      placement: placements,
      firstName: persons.firstName,
      lastName: persons.lastName,
      employerName: employers.legalName,
      requisitionTitle: jobRequisitions.title,
    })
    .from(placements)
    .innerJoin(persons, eq(persons.id, placements.personId))
    .innerJoin(employers, eq(employers.id, placements.employerId))
    .innerJoin(jobRequisitions, eq(jobRequisitions.id, placements.jobRequisitionId))
    .orderBy(desc(placements.createdAt));
  return rows.map((r) => ({
    ...r.placement,
    personName: `${r.firstName} ${r.lastName}`,
    employerName: r.employerName,
    requisitionTitle: r.requisitionTitle,
  }));
}

export async function createPlacement(input: CreatePlacementInput): Promise<Placement> {
  const session = await requireRole(['ADMIN', 'STAFF']);
  const parsed = CreatePlacementSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid placement',
      parsed.error.flatten().fieldErrors as Record<string, string>,
    );
  }
  const d = parsed.data;

  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(placements)
      .values({
        personId: d.personId,
        employerId: d.employerId,
        jobRequisitionId: d.jobRequisitionId,
        jobApplicationId: blankToNull(d.jobApplicationId) ?? undefined,
        status: d.status,
        offerDate: blankToNull(d.offerDate),
        startDate: blankToNull(d.startDate),
        salary: blankToNull(d.salary),
        salaryCurrencyCode: blankToNull(d.salaryCurrencyCode) ?? undefined,
        notes: blankToNull(d.notes),
      })
      .returning();
    if (!created) throw new Error('insert returned no row');

    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'placement',
      entityId: created.id,
      action: 'CREATED',
      after: {
        personId: created.personId,
        employerId: created.employerId,
        jobRequisitionId: created.jobRequisitionId,
        status: created.status,
      },
    });

    // If we're creating directly at CONFIRMED (or later), trigger availability flip.
    if (created.status === 'CONFIRMED' || created.status === 'STARTED') {
      await flipAvailabilityToPlaced(tx, session.user.id, created.personId, created.id);
    }

    // Update requisition positions filled if we've reached CONFIRMED
    if (created.status === 'CONFIRMED' || created.status === 'STARTED') {
      await updateRequisitionFillCount(tx, session.user.id, created.jobRequisitionId, +1);
    }

    return created;
  });
}

async function flipAvailabilityToPlaced(
  tx: Parameters<typeof recordAudit>[0],
  actorUserId: string,
  personId: string,
  placementId: string,
) {
  const [profile] = await tx
    .select()
    .from(candidateProfiles)
    .where(eq(candidateProfiles.personId, personId))
    .limit(1);
  if (!profile) return; // No candidate profile → nothing to flip
  if (profile.availabilityStatus === 'PLACED') return;

  await tx
    .update(candidateProfiles)
    .set({ availabilityStatus: 'PLACED', updatedAt: sql`NOW()` })
    .where(eq(candidateProfiles.id, profile.id));

  await recordAudit(tx, {
    actorUserId,
    entityType: 'candidate_profile',
    entityId: profile.id,
    action: 'AVAILABILITY_CHANGED',
    before: { availabilityStatus: profile.availabilityStatus },
    after: { availabilityStatus: 'PLACED' },
    context: { via: 'placement_confirmed', placementId },
  });
}

async function updateRequisitionFillCount(
  tx: Parameters<typeof recordAudit>[0],
  actorUserId: string,
  requisitionId: string,
  delta: number,
) {
  const [req] = await tx
    .select()
    .from(jobRequisitions)
    .where(eq(jobRequisitions.id, requisitionId))
    .limit(1);
  if (!req) return;
  const newFilled = Math.max(0, req.positionsFilled + delta);
  const newStatus =
    newFilled >= req.positionsRequired ? 'FILLED' : newFilled > 0 ? 'PARTIALLY_FILLED' : req.status;
  await tx
    .update(jobRequisitions)
    .set({ positionsFilled: newFilled, status: newStatus, updatedAt: sql`NOW()` })
    .where(eq(jobRequisitions.id, requisitionId));
  if (newStatus !== req.status) {
    await recordAudit(tx, {
      actorUserId,
      entityType: 'job_requisition',
      entityId: requisitionId,
      action: 'STATUS_CHANGED',
      before: { status: req.status, positionsFilled: req.positionsFilled },
      after: { status: newStatus, positionsFilled: newFilled },
      context: { via: 'placement_transition' },
    });
  }
}

export async function updatePlacementStatus(input: UpdatePlacementStatusInput): Promise<Placement> {
  const session = await requireRole(['ADMIN', 'STAFF']);
  const parsed = UpdatePlacementStatusSchema.parse(input);

  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(placements)
      .where(eq(placements.id, parsed.placementId))
      .limit(1);
    if (!before) throw new BusinessRuleError('PLACEMENT_NOT_FOUND', 'Placement not found');
    if (before.status === parsed.status) return before;

    const [after] = await tx
      .update(placements)
      .set({
        status: parsed.status,
        endDate: blankToNull(parsed.endDate) ?? before.endDate,
        updatedAt: sql`NOW()`,
      })
      .where(eq(placements.id, parsed.placementId))
      .returning();
    if (!after) throw new Error('update returned no row');

    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'placement',
      entityId: after.id,
      action: 'STATUS_CHANGED',
      before: { status: before.status },
      after: { status: after.status },
    });

    // PROPOSED → CONFIRMED: fill count + availability flip
    if (before.status === 'PROPOSED' && parsed.status === 'CONFIRMED') {
      await flipAvailabilityToPlaced(tx, session.user.id, before.personId, before.id);
      await updateRequisitionFillCount(tx, session.user.id, before.jobRequisitionId, +1);
    }

    // Terminated / Completed → maybe free up seat + availability back?
    // Business rule: DO NOT auto-restore availability on completion — staff drives explicitly.
    // But DO decrement positionsFilled when a CONFIRMED/STARTED placement is terminated early,
    // because that seat is now open again.
    if (
      (before.status === 'CONFIRMED' || before.status === 'STARTED') &&
      parsed.status === 'TERMINATED_EARLY'
    ) {
      await updateRequisitionFillCount(tx, session.user.id, before.jobRequisitionId, -1);
    }

    return after;
  });
}

/**
 * Manual availability restore (per business rule: after a placement ends, staff decides
 * when a candidate is available again — never automatic).
 */
export async function restoreCandidateAvailability(input: RestoreAvailabilityInput) {
  const session = await requireRole(['ADMIN', 'STAFF']);
  const parsed = RestoreAvailabilitySchema.parse(input);

  return db.transaction(async (tx) => {
    const [profile] = await tx
      .select()
      .from(candidateProfiles)
      .where(eq(candidateProfiles.personId, parsed.personId))
      .limit(1);
    if (!profile) throw new BusinessRuleError('PROFILE_NOT_FOUND', 'Candidate profile not found');
    if (profile.availabilityStatus === 'AVAILABLE') return profile;

    await tx
      .update(candidateProfiles)
      .set({ availabilityStatus: 'AVAILABLE', updatedAt: sql`NOW()` })
      .where(eq(candidateProfiles.id, profile.id));

    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'candidate_profile',
      entityId: profile.id,
      action: 'AVAILABILITY_CHANGED',
      before: { availabilityStatus: profile.availabilityStatus },
      after: { availabilityStatus: 'AVAILABLE' },
      context: { reason: parsed.reason, manual: true },
    });

    return { ...profile, availabilityStatus: 'AVAILABLE' as const };
  });
}

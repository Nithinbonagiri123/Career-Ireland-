import { and, desc, eq, inArray, isNull, type SQL, sql } from 'drizzle-orm';
import { recordAudit } from '@/lib/audit/withAudit';
import { requireInternalStaff } from '@/lib/auth/session';
import { type DateRange, dateRangeWhere } from '@/lib/date-range';
import { db } from '@/lib/db/client';
import { invoices } from '@/lib/db/schema/billing';
import { candidateProfiles, persons } from '@/lib/db/schema/persons';
import {
  employers,
  jobApplications,
  jobRequisitions,
  type Placement,
  placements,
} from '@/lib/db/schema/recruitment';
import { BusinessRuleError, ValidationError } from '@/lib/errors';
import {
  APPLICATION_TRANSITIONS,
  assertTransition,
  PLACEMENT_TRANSITIONS,
} from '@/lib/state-machine';
import {
  type ArchivePlacementInput,
  ArchivePlacementSchema,
  type CreatePlacementInput,
  CreatePlacementSchema,
  type RestoreAvailabilityInput,
  RestoreAvailabilitySchema,
  type UnarchivePlacementInput,
  UnarchivePlacementSchema,
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
  /** Most recent non-voided fee invoice raised for this placement, if
   *  any. Powers the "Invoice" column on the placements table so staff
   *  can see at a glance whether the placement has been billed. Null
   *  when no invoice with placement_id === this row exists. */
  latestInvoice: {
    id: string;
    number: string;
    status: 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'VOIDED';
    totalAmount: string;
    currencyCode: string;
  } | null;
};

export async function fetchPlacements(createdRange?: DateRange): Promise<PlacementListRow[]> {
  await requireInternalStaff();
  const createdCond = createdRange ? dateRangeWhere(placements.createdAt, createdRange) : undefined;
  const whereConds: SQL[] = [isNull(placements.archivedAt)];
  if (createdCond) whereConds.push(createdCond);
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
    .where(and(...whereConds))
    .orderBy(desc(placements.createdAt));

  // Bulk-load the latest fee invoice for each placement in one query.
  // Rank by issuedAt DESC so voided-then-reissued reads the reissue.
  const placementIds = rows.map((r) => r.placement.id);
  const invoiceById = new Map<string, PlacementListRow['latestInvoice']>();
  if (placementIds.length > 0) {
    const invoiceRows = await db
      .select({
        id: invoices.id,
        number: invoices.number,
        status: invoices.status,
        totalAmount: invoices.totalAmount,
        currencyCode: invoices.currencyCode,
        placementId: invoices.placementId,
        rn: sql<number>`ROW_NUMBER() OVER (PARTITION BY ${invoices.placementId} ORDER BY ${invoices.issuedAt} DESC)`,
      })
      .from(invoices)
      .where(inArray(invoices.placementId, placementIds));
    for (const iv of invoiceRows) {
      if (iv.rn !== 1 || !iv.placementId) continue;
      invoiceById.set(iv.placementId, {
        id: iv.id,
        number: iv.number,
        status: iv.status as 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'VOIDED',
        totalAmount: iv.totalAmount,
        currencyCode: iv.currencyCode,
      });
    }
  }

  return rows.map((r) => ({
    ...r.placement,
    personName: `${r.firstName} ${r.lastName}`,
    employerName: r.employerName,
    requisitionTitle: r.requisitionTitle,
    latestInvoice: invoiceById.get(r.placement.id) ?? null,
  }));
}

/**
 * Placements scoped to a single requisition, with their fee-invoice
 * summary. Feeds the "Placements & Fees" card on the requisition
 * detail page so staff can see who was placed, at what salary, and
 * whether a fee invoice has been raised — all without leaving the
 * requisition.
 */
export async function listPlacementsForRequisition(
  requisitionId: string,
): Promise<PlacementListRow[]> {
  await requireInternalStaff();
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
    .where(and(eq(placements.jobRequisitionId, requisitionId), isNull(placements.archivedAt)))
    .orderBy(desc(placements.createdAt));

  const placementIds = rows.map((r) => r.placement.id);
  const invoiceById = new Map<string, PlacementListRow['latestInvoice']>();
  if (placementIds.length > 0) {
    const invoiceRows = await db
      .select({
        id: invoices.id,
        number: invoices.number,
        status: invoices.status,
        totalAmount: invoices.totalAmount,
        currencyCode: invoices.currencyCode,
        placementId: invoices.placementId,
        rn: sql<number>`ROW_NUMBER() OVER (PARTITION BY ${invoices.placementId} ORDER BY ${invoices.issuedAt} DESC)`,
      })
      .from(invoices)
      .where(inArray(invoices.placementId, placementIds));
    for (const iv of invoiceRows) {
      if (iv.rn !== 1 || !iv.placementId) continue;
      invoiceById.set(iv.placementId, {
        id: iv.id,
        number: iv.number,
        status: iv.status as 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'VOIDED',
        totalAmount: iv.totalAmount,
        currencyCode: iv.currencyCode,
      });
    }
  }

  return rows.map((r) => ({
    ...r.placement,
    personName: `${r.firstName} ${r.lastName}`,
    employerName: r.employerName,
    requisitionTitle: r.requisitionTitle,
    latestInvoice: invoiceById.get(r.placement.id) ?? null,
  }));
}

/**
 * One-click "Mark Placed" from the requisition pipeline: flips the
 * application to ACCEPTED AND creates a CONFIRMED placement in the same
 * transaction. That's the shape the user actually wants — no separate
 * placement dialog, no waiting-to-be-confirmed limbo. Availability flip
 * on the candidate + requisition fill count recompute happen in the
 * same transaction via the existing createPlacement path.
 *
 * Idempotent: if the application is already ACCEPTED with a placement,
 * returns the existing placement rather than double-creating.
 */
export async function markApplicationPlaced(applicationId: string): Promise<Placement> {
  const session = await requireInternalStaff();
  return db.transaction(async (tx) => {
    const [app] = await tx
      .select({
        id: jobApplications.id,
        personId: jobApplications.personId,
        jobRequisitionId: jobApplications.jobRequisitionId,
        status: jobApplications.status,
      })
      .from(jobApplications)
      .where(eq(jobApplications.id, applicationId))
      .limit(1);
    if (!app) throw new BusinessRuleError('APPLICATION_NOT_FOUND', 'Application not found');
    if (!app.jobRequisitionId)
      throw new BusinessRuleError(
        'APPLICATION_EXTERNAL',
        'External applications cannot be placed on our requisitions',
      );
    // R0 — this used to jump an application to ACCEPTED from any status
    // with no transition check and no audit row. Placement is only legal
    // from OFFER (the OFFER→ACCEPTED hop) or from an already-ACCEPTED
    // application (the pipeline's confirm path).
    if (app.status !== 'ACCEPTED') {
      assertTransition('application', app.status, 'ACCEPTED', APPLICATION_TRANSITIONS);
    }

    const [req] = await tx
      .select({ employerId: jobRequisitions.employerId })
      .from(jobRequisitions)
      .where(eq(jobRequisitions.id, app.jobRequisitionId))
      .limit(1);
    if (!req) throw new BusinessRuleError('REQUISITION_NOT_FOUND', 'Requisition not found');

    // Already placed? Return the existing row so the pipeline click stays
    // idempotent (double-clicks, revalidate races, etc.).
    const [existing] = await tx
      .select()
      .from(placements)
      .where(
        and(
          eq(placements.personId, app.personId),
          eq(placements.jobRequisitionId, app.jobRequisitionId),
          isNull(placements.archivedAt),
        ),
      )
      .limit(1);
    if (existing) {
      if (app.status !== 'ACCEPTED') {
        await tx
          .update(jobApplications)
          .set({ status: 'ACCEPTED', updatedAt: sql`NOW()` })
          .where(eq(jobApplications.id, applicationId));
        await recordAudit(tx, {
          actorUserId: session.user.id,
          entityType: 'job_application',
          entityId: applicationId,
          action: 'STATUS_CHANGED',
          before: { status: app.status },
          after: { status: 'ACCEPTED' },
          context: { via: 'pipeline_mark_placed' },
        });
      }
      // Stage C workflow collapse — accepting an application auto-creates
      // a PROPOSED placement (applications/service.ts), so "mark placed"
      // on it means CONFIRM that placement: the same PROPOSED→CONFIRMED
      // hop updatePlacementStatus performs, with the same availability
      // flip and audit. Without this, the one-click path returned the
      // proposed row untouched and the candidate never read as Placed.
      if (existing.status === 'PROPOSED') {
        await assertSeatAvailable(tx, {
          requisitionId: app.jobRequisitionId,
          forPersonId: app.personId,
          excludePlacementId: existing.id,
        });
        const [confirmed] = await tx
          .update(placements)
          .set({ status: 'CONFIRMED', updatedAt: sql`NOW()` })
          .where(eq(placements.id, existing.id))
          .returning();
        if (!confirmed) throw new Error('placement confirm returned no row');
        await recordAudit(tx, {
          actorUserId: session.user.id,
          entityType: 'placement',
          entityId: confirmed.id,
          action: 'STATUS_CHANGED',
          before: { status: 'PROPOSED' },
          after: { status: 'CONFIRMED' },
          context: { via: 'pipeline_mark_placed', applicationId },
        });
        await flipAvailabilityToPlaced(tx, session.user.id, confirmed.personId, confirmed.id);
        await recomputeRequisitionFillCount(tx, session.user.id, confirmed.jobRequisitionId);
        return confirmed;
      }
      return existing;
    }

    await assertSeatAvailable(tx, {
      requisitionId: app.jobRequisitionId,
      forPersonId: app.personId,
    });
    const [created] = await tx
      .insert(placements)
      .values({
        personId: app.personId,
        employerId: req.employerId,
        jobRequisitionId: app.jobRequisitionId,
        jobApplicationId: applicationId,
        status: 'CONFIRMED',
      })
      .returning();
    if (!created) throw new Error('placement insert returned no row');

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
      context: { via: 'pipeline_mark_placed', applicationId },
    });

    // Flip the application status alongside the placement so the two
    // tables agree.
    if (app.status !== 'ACCEPTED') {
      await tx
        .update(jobApplications)
        .set({ status: 'ACCEPTED', updatedAt: sql`NOW()` })
        .where(eq(jobApplications.id, applicationId));
      await recordAudit(tx, {
        actorUserId: session.user.id,
        entityType: 'job_application',
        entityId: applicationId,
        action: 'STATUS_CHANGED',
        before: { status: app.status },
        after: { status: 'ACCEPTED' },
        context: { via: 'pipeline_mark_placed' },
      });
    }

    await flipAvailabilityToPlaced(tx, session.user.id, created.personId, created.id);
    await recomputeRequisitionFillCount(tx, session.user.id, created.jobRequisitionId);

    return created;
  });
}

export async function createPlacement(input: CreatePlacementInput): Promise<Placement> {
  const session = await requireInternalStaff();
  const parsed = CreatePlacementSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid placement',
      parsed.error.flatten().fieldErrors as Record<string, string>,
    );
  }
  const d = parsed.data;

  return db.transaction(async (tx) => {
    // R0 — direct creation used to accept any employer/requisition pair,
    // duplicates, and overfills. The guard locks the requisition row so
    // concurrent confirmations cannot both pass.
    if (d.status === 'CONFIRMED' || d.status === 'STARTED' || d.status === 'COMPLETED') {
      await assertSeatAvailable(tx, {
        requisitionId: d.jobRequisitionId,
        forPersonId: d.personId,
        employerId: d.employerId,
      });
    } else {
      // Even a PROPOSED placement must belong to the requisition's employer.
      const [reqRow] = await tx
        .select({ employerId: jobRequisitions.employerId })
        .from(jobRequisitions)
        .where(eq(jobRequisitions.id, d.jobRequisitionId))
        .limit(1);
      if (!reqRow) throw new BusinessRuleError('REQUISITION_NOT_FOUND', 'Requisition not found');
      if (reqRow.employerId !== d.employerId) {
        throw new BusinessRuleError(
          'PLACEMENT_EMPLOYER_MISMATCH',
          'The placement employer does not match the requisition employer',
        );
      }
    }
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

    // Recompute the requisition fill count from placements after any change.
    await recomputeRequisitionFillCount(tx, session.user.id, created.jobRequisitionId);

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

/** Seats actually consumed: DISTINCT persons with a live (non-archived)
 *  CONFIRMED / STARTED / COMPLETED placement on the requisition. R0 —
 *  the old count included archived placements and counted duplicate
 *  rows per person. */
async function countSeatsFilled(
  tx: Parameters<typeof recordAudit>[0],
  requisitionId: string,
): Promise<number> {
  const [row] = await tx
    .select({ filled: sql<number>`COUNT(DISTINCT ${placements.personId})::int` })
    .from(placements)
    .where(
      and(
        eq(placements.jobRequisitionId, requisitionId),
        inArray(placements.status, ['CONFIRMED', 'STARTED', 'COMPLETED']),
        isNull(placements.archivedAt),
      ),
    );
  return row?.filled ?? 0;
}

/**
 * R0 transaction-safe seat guard. Locks the requisition row (FOR UPDATE)
 * so two concurrent confirmations cannot both pass the check, then
 * refuses:
 *  - a requisition that doesn't exist,
 *  - an employer mismatch (when employerId is supplied),
 *  - a duplicate live placement for the same person (when the person is
 *    not already the one being confirmed),
 *  - overfilling: confirming one more seat than positionsRequired.
 * `forPersonId` names the person about to take a seat: if they already
 * hold one of the counted seats, confirming them again is the duplicate
 * refusal, not an overfill.
 */
async function assertSeatAvailable(
  tx: Parameters<typeof recordAudit>[0],
  opts: {
    requisitionId: string;
    forPersonId: string;
    employerId?: string;
    /** placement being transitioned (its own row shouldn't trip the duplicate check) */
    excludePlacementId?: string;
  },
): Promise<void> {
  const [req] = await tx
    .select({
      id: jobRequisitions.id,
      employerId: jobRequisitions.employerId,
      positionsRequired: jobRequisitions.positionsRequired,
    })
    .from(jobRequisitions)
    .where(eq(jobRequisitions.id, opts.requisitionId))
    .for('update')
    .limit(1);
  if (!req) throw new BusinessRuleError('REQUISITION_NOT_FOUND', 'Requisition not found');
  if (opts.employerId && opts.employerId !== req.employerId) {
    throw new BusinessRuleError(
      'PLACEMENT_EMPLOYER_MISMATCH',
      'The placement employer does not match the requisition employer',
    );
  }

  const liveSeatConds = [
    eq(placements.jobRequisitionId, opts.requisitionId),
    inArray(placements.status, ['CONFIRMED', 'STARTED', 'COMPLETED']),
    isNull(placements.archivedAt),
  ];

  const [dup] = await tx
    .select({ id: placements.id })
    .from(placements)
    .where(and(...liveSeatConds, eq(placements.personId, opts.forPersonId)))
    .limit(1);
  if (dup && dup.id !== opts.excludePlacementId) {
    throw new BusinessRuleError(
      'PLACEMENT_DUPLICATE',
      'This candidate already holds a confirmed placement on this requisition',
    );
  }
  if (dup) return; // the person already holds the seat being re-confirmed — no new seat consumed

  const filled = await countSeatsFilled(tx, opts.requisitionId);
  if (filled >= req.positionsRequired) {
    throw new BusinessRuleError(
      'REQUISITION_OVERFILLED',
      `All ${req.positionsRequired} position(s) on this requisition are already filled`,
    );
  }
}

/**
 * Recomputes `positions_filled` from the placements table (source of truth) rather than
 * tracking a delta. A placement counts as "filling a seat" while it is CONFIRMED, STARTED
 * or COMPLETED. PROPOSED and TERMINATED_EARLY do not consume a seat.
 *
 * Status roll-up:
 *  - filled >= required                 → FILLED
 *  - 0 < filled < required              → PARTIALLY_FILLED
 *  - filled == 0 and was FILLED/PARTIAL → IN_PROGRESS (staff can reopen manually)
 *  - otherwise                          → unchanged
 */
export async function recomputeRequisitionFillCount(
  tx: Parameters<typeof recordAudit>[0],
  actorUserId: string,
  requisitionId: string,
) {
  const [req] = await tx
    .select()
    .from(jobRequisitions)
    .where(eq(jobRequisitions.id, requisitionId))
    .limit(1);
  if (!req) return;

  const newFilled = await countSeatsFilled(tx, requisitionId);
  let newStatus: typeof req.status = req.status;
  // R0 — a terminal or draft requisition keeps its lifecycle status: the
  // recompute used to resurrect CLOSED/CANCELLED rows to FILLED. Only the
  // counter is corrected for those.
  const statusLocked =
    req.status === 'CLOSED' || req.status === 'CANCELLED' || req.status === 'DRAFT';
  if (statusLocked) {
    newStatus = req.status;
  } else if (newFilled >= req.positionsRequired) {
    newStatus = 'FILLED';
  } else if (newFilled > 0) {
    newStatus = 'PARTIALLY_FILLED';
  } else if (req.status === 'FILLED' || req.status === 'PARTIALLY_FILLED') {
    newStatus = 'IN_PROGRESS';
  }

  if (newFilled === req.positionsFilled && newStatus === req.status) return;

  await tx
    .update(jobRequisitions)
    .set({ positionsFilled: newFilled, status: newStatus, updatedAt: sql`NOW()` })
    .where(eq(jobRequisitions.id, requisitionId));

  await recordAudit(tx, {
    actorUserId,
    entityType: 'job_requisition',
    entityId: requisitionId,
    action: newStatus !== req.status ? 'STATUS_CHANGED' : 'UPDATED',
    before: { status: req.status, positionsFilled: req.positionsFilled },
    after: { status: newStatus, positionsFilled: newFilled },
    context: { via: 'placement_recompute' },
  });
}

export async function updatePlacementStatus(input: UpdatePlacementStatusInput): Promise<Placement> {
  const session = await requireInternalStaff();
  const parsed = UpdatePlacementStatusSchema.parse(input);

  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(placements)
      .where(eq(placements.id, parsed.placementId))
      .limit(1);
    if (!before) throw new BusinessRuleError('PLACEMENT_NOT_FOUND', 'Placement not found');
    if (before.status === parsed.status) return before;

    assertTransition('placement', before.status, parsed.status, PLACEMENT_TRANSITIONS);

    // R0 — confirming a seat must pass the same duplicate/overfill guard
    // as every other confirmation path.
    if (before.status === 'PROPOSED' && parsed.status === 'CONFIRMED') {
      await assertSeatAvailable(tx, {
        requisitionId: before.jobRequisitionId,
        forPersonId: before.personId,
        excludePlacementId: before.id,
      });
    }

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

    // PROPOSED → CONFIRMED: flip candidate availability (still manual to restore on completion)
    if (before.status === 'PROPOSED' && parsed.status === 'CONFIRMED') {
      await flipAvailabilityToPlaced(tx, session.user.id, before.personId, before.id);
    }

    // Recompute fill count from source of truth after any status change.
    await recomputeRequisitionFillCount(tx, session.user.id, before.jobRequisitionId);

    return after;
  });
}

/**
 * Manual availability restore (per business rule: after a placement ends, staff decides
 * when a candidate is available again — never automatic).
 */
export async function restoreCandidateAvailability(input: RestoreAvailabilityInput) {
  const session = await requireInternalStaff();
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

// ─── Archive / unarchive ──────────────────────────────────────────────────────

async function findPlacement(tx: Parameters<typeof recordAudit>[0], id: string) {
  const [row] = await tx.select().from(placements).where(eq(placements.id, id)).limit(1);
  return row ?? null;
}

/** Soft-archive a placement. Hidden from lists. Requisition fill counts are NOT recomputed on archive. */
export async function archivePlacement(input: ArchivePlacementInput): Promise<Placement> {
  const session = await requireInternalStaff();
  const parsed = ArchivePlacementSchema.parse(input);
  return db.transaction(async (tx) => {
    const before = await findPlacement(tx, parsed.placementId);
    if (!before) throw new BusinessRuleError('PLACEMENT_NOT_FOUND', 'Placement not found');
    if (before.archivedAt) {
      throw new BusinessRuleError('ALREADY_ARCHIVED', 'Placement is already archived');
    }
    const [after] = await tx
      .update(placements)
      .set({
        archivedAt: new Date(),
        archivedByUserId: session.user.id,
        updatedAt: sql`NOW()`,
      })
      .where(eq(placements.id, parsed.placementId))
      .returning();
    if (!after) throw new Error('archive returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'placement',
      entityId: after.id,
      action: 'ARCHIVED',
      before: { archivedAt: null },
      after: { archivedAt: after.archivedAt },
      context: { reason: parsed.reason },
    });
    return after;
  });
}

export async function unarchivePlacement(input: UnarchivePlacementInput): Promise<Placement> {
  const session = await requireInternalStaff();
  const parsed = UnarchivePlacementSchema.parse(input);
  return db.transaction(async (tx) => {
    const before = await findPlacement(tx, parsed.placementId);
    if (!before) throw new BusinessRuleError('PLACEMENT_NOT_FOUND', 'Placement not found');
    if (!before.archivedAt) {
      throw new BusinessRuleError('NOT_ARCHIVED', 'Placement is not archived');
    }
    const [after] = await tx
      .update(placements)
      .set({ archivedAt: null, archivedByUserId: null, updatedAt: sql`NOW()` })
      .where(eq(placements.id, parsed.placementId))
      .returning();
    if (!after) throw new Error('unarchive returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'placement',
      entityId: after.id,
      action: 'UNARCHIVED',
      before: { archivedAt: before.archivedAt },
      after: { archivedAt: null },
      context: { reason: parsed.reason },
    });
    return after;
  });
}

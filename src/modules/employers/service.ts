import { and, asc, desc, eq, inArray, isNull, ne, or, type SQL, sql } from 'drizzle-orm';
import { recordAudit } from '@/lib/audit/withAudit';
import { createOrEdit, requireRecruitment } from '@/lib/auth/recruitment-guards';
import { requireInternalStaff } from '@/lib/auth/session';
import { type DateRange, dateRangeWhere } from '@/lib/date-range';
import { db } from '@/lib/db/client';
import { auditEvents } from '@/lib/db/schema/audit_events';
import {
  type Employer,
  type EmployerContact,
  employerContacts,
  employers,
  jobRequisitions,
  placements,
} from '@/lib/db/schema/recruitment';
import { users } from '@/lib/db/schema/users';
import { BusinessRuleError, ValidationError } from '@/lib/errors';
import { type AssignmentScope, assignmentCondition } from '@/lib/scope';
import { describeContactEvent } from './contact-activity';
import {
  type ArchiveEmployerInput,
  ArchiveEmployerSchema,
  type UnarchiveEmployerInput,
  UnarchiveEmployerSchema,
  type UpsertContactInput,
  UpsertContactSchema,
  type UpsertEmployerInput,
  UpsertEmployerSchema,
} from './schemas';

function blankToNull(v: string | undefined | null): string | null {
  return v && v.trim().length > 0 ? v : null;
}

export async function fetchEmployers(
  scope?: AssignmentScope,
  createdRange?: DateRange,
): Promise<Employer[]> {
  const session = await requireInternalStaff();
  const scopeCond = scope
    ? assignmentCondition(scope, employers.assignedUserId, session.user.id)
    : undefined;
  const createdCond = createdRange ? dateRangeWhere(employers.createdAt, createdRange) : undefined;
  const whereConds: SQL[] = [isNull(employers.archivedAt)];
  if (scopeCond) whereConds.push(scopeCond);
  if (createdCond) whereConds.push(createdCond);
  return db
    .select()
    .from(employers)
    .where(and(...whereConds))
    .orderBy(desc(employers.createdAt));
}

export type EmployerListStats = {
  openJobs: number;
  seatsToFill: number;
  contacts: number;
  placements: number;
};

/**
 * Stage 6G employer cards — per-employer counts for the list page, in three
 * grouped reads (no per-row queries). Archived jobs / placements are ignored.
 */
export async function fetchEmployerListStats(): Promise<Map<string, EmployerListStats>> {
  await requireInternalStaff();
  const [jobs, contacts, placed] = await Promise.all([
    db
      .select({
        employerId: jobRequisitions.employerId,
        openJobs: sql<number>`count(*)::int`,
        seatsToFill: sql<number>`coalesce(sum(greatest(${jobRequisitions.positionsRequired} - ${jobRequisitions.positionsFilled}, 0)), 0)::int`,
      })
      .from(jobRequisitions)
      .where(
        and(
          isNull(jobRequisitions.archivedAt),
          inArray(jobRequisitions.status, ['OPEN', 'IN_PROGRESS', 'PARTIALLY_FILLED']),
        ),
      )
      .groupBy(jobRequisitions.employerId),
    db
      .select({ employerId: employerContacts.employerId, n: sql<number>`count(*)::int` })
      .from(employerContacts)
      .groupBy(employerContacts.employerId),
    db
      .select({ employerId: placements.employerId, n: sql<number>`count(*)::int` })
      .from(placements)
      .where(isNull(placements.archivedAt))
      .groupBy(placements.employerId),
  ]);
  const out = new Map<string, EmployerListStats>();
  const get = (id: string) => {
    let s = out.get(id);
    if (!s) {
      s = { openJobs: 0, seatsToFill: 0, contacts: 0, placements: 0 };
      out.set(id, s);
    }
    return s;
  };
  for (const r of jobs)
    Object.assign(get(r.employerId), { openJobs: r.openJobs, seatsToFill: r.seatsToFill });
  for (const r of contacts) get(r.employerId).contacts = r.n;
  for (const r of placed) get(r.employerId).placements = r.n;
  return out;
}

export async function fetchEmployer(id: string): Promise<Employer | null> {
  await requireInternalStaff();
  const [row] = await db.select().from(employers).where(eq(employers.id, id)).limit(1);
  return row ?? null;
}

/**
 * Fuzzy match for duplicate-detection during employer creation.
 * Scoring:
 *   - Exact legal name (case-insensitive)     : +50
 *   - Exact trading name (case-insensitive)   : +40
 *   - Website domain match                    : +30
 *   - Prefix match on legal / trading name    : +15
 *
 * Returns only rows with any match — sorted by score descending, capped at 8.
 */
export type SimilarEmployer = {
  employer: Employer;
  reasons: Array<'EXACT_LEGAL_NAME' | 'EXACT_TRADING_NAME' | 'DOMAIN_MATCH' | 'NAME_PREFIX'>;
  score: number;
};

function extractDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  const s = url.trim().toLowerCase();
  if (s.length === 0) return null;
  // Strip protocol and path, keep only host.
  const cleaned = s
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    ?.split('?')[0];
  return cleaned && cleaned.length > 3 ? cleaned : null;
}

export async function findSimilarEmployers(input: {
  legalName?: string;
  tradingName?: string;
  website?: string;
}): Promise<SimilarEmployer[]> {
  await requireInternalStaff();
  const legalNorm = input.legalName?.trim().toLowerCase();
  const tradingNorm = input.tradingName?.trim().toLowerCase();
  const domain = extractDomain(input.website);

  // Need at least one meaningful signal (4+ chars for name-prefix to be useful).
  if ((!legalNorm || legalNorm.length < 3) && (!tradingNorm || tradingNorm.length < 3) && !domain) {
    return [];
  }

  const conditions = [
    legalNorm && legalNorm.length >= 3
      ? sql`lower(${employers.legalName}) like ${`${legalNorm.slice(0, 8)}%`}`
      : undefined,
    tradingNorm && tradingNorm.length >= 3
      ? sql`lower(${employers.tradingName}) like ${`${tradingNorm.slice(0, 8)}%`}`
      : undefined,
    domain ? sql`lower(${employers.website}) like ${`%${domain}%`}` : undefined,
  ].filter(Boolean);

  if (conditions.length === 0) return [];

  const candidates = await db
    .select()
    .from(employers)
    .where(and(isNull(employers.archivedAt), or(...conditions)))
    .limit(40);

  const scored = candidates.map((e) => {
    const reasons: SimilarEmployer['reasons'] = [];
    let score = 0;
    const eLegalNorm = e.legalName.toLowerCase();
    const eTradingNorm = e.tradingName?.toLowerCase() ?? null;
    const eDomain = extractDomain(e.website);

    if (legalNorm && eLegalNorm === legalNorm) {
      reasons.push('EXACT_LEGAL_NAME');
      score += 50;
    } else if (
      legalNorm &&
      legalNorm.length >= 4 &&
      (eLegalNorm.startsWith(legalNorm.slice(0, 6)) || legalNorm.startsWith(eLegalNorm.slice(0, 6)))
    ) {
      reasons.push('NAME_PREFIX');
      score += 15;
    }

    if (tradingNorm && eTradingNorm === tradingNorm) {
      reasons.push('EXACT_TRADING_NAME');
      score += 40;
    } else if (
      tradingNorm &&
      eTradingNorm &&
      tradingNorm.length >= 4 &&
      (eTradingNorm.startsWith(tradingNorm.slice(0, 6)) ||
        tradingNorm.startsWith(eTradingNorm.slice(0, 6)))
    ) {
      if (!reasons.includes('NAME_PREFIX')) reasons.push('NAME_PREFIX');
      score += 10;
    }

    if (domain && eDomain === domain) {
      reasons.push('DOMAIN_MATCH');
      score += 30;
    }

    return { employer: e, reasons, score };
  });

  return scored
    .filter((s) => s.reasons.length > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

export async function fetchEmployerContacts(employerId: string): Promise<EmployerContact[]> {
  await requireInternalStaff();
  return db
    .select()
    .from(employerContacts)
    .where(eq(employerContacts.employerId, employerId))
    .orderBy(desc(employerContacts.isPrimary), asc(employerContacts.fullName));
}

export async function upsertEmployer(input: UpsertEmployerInput): Promise<Employer> {
  const session = await requireRecruitment('employers', createOrEdit(input));
  const parsed = UpsertEmployerSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid employer',
      parsed.error.flatten().fieldErrors as Record<string, string>,
    );
  }
  const d = parsed.data;
  // Session 33 — on CREATE, auto-assign to the creator (see memory
  // `record-ownership-rules`). Edits never re-stamp the owner because
  // only the business owner can reassign, via the dedicated action.
  const values = {
    legalName: d.legalName.trim(),
    tradingName: blankToNull(d.tradingName),
    website: blankToNull(d.website),
    industry: blankToNull(d.industry),
    country: blankToNull(d.country),
    city: blankToNull(d.city),
    addressLine1: blankToNull(d.addressLine1),
    addressLine2: blankToNull(d.addressLine2),
    postcode: blankToNull(d.postcode),
    billingEmail: blankToNull(d.billingEmail),
    vatId: blankToNull(d.vatId),
    vatTreatment: d.vatTreatment,
    paymentTermsDays: d.paymentTermsDays ?? null,
    relationshipStatus: d.relationshipStatus,
    notes: blankToNull(d.notes),
  };

  return db.transaction(async (tx) => {
    if (d.id) {
      const [before] = await tx.select().from(employers).where(eq(employers.id, d.id)).limit(1);
      if (!before) throw new BusinessRuleError('EMPLOYER_NOT_FOUND', 'Employer not found');
      const [after] = await tx
        .update(employers)
        .set({ ...values, updatedAt: sql`NOW()` })
        .where(eq(employers.id, d.id))
        .returning();
      if (!after) throw new Error('update returned no row');
      await recordAudit(tx, {
        actorUserId: session.user.id,
        entityType: 'employer',
        entityId: after.id,
        action: 'UPDATED',
        // R0 — VAT, terms and billing email changes were invisible in
        // the audit trail; they are exactly the fields finance cares about.
        before: {
          legalName: before.legalName,
          relationshipStatus: before.relationshipStatus,
          vatTreatment: before.vatTreatment,
          vatId: before.vatId,
          paymentTermsDays: before.paymentTermsDays,
          billingEmail: before.billingEmail,
        },
        after: {
          legalName: after.legalName,
          relationshipStatus: after.relationshipStatus,
          vatTreatment: after.vatTreatment,
          vatId: after.vatId,
          paymentTermsDays: after.paymentTermsDays,
          billingEmail: after.billingEmail,
        },
      });
      return after;
    }
    const [created] = await tx
      .insert(employers)
      .values({ ...values, assignedUserId: session.user.id })
      .returning();
    if (!created) throw new Error('insert returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'employer',
      entityId: created.id,
      action: 'CREATED',
      after: { legalName: created.legalName, relationshipStatus: created.relationshipStatus },
    });
    return created;
  });
}

/**
 * Mark an employer's onboarding as complete. Blueprint §4.1 — gives the
 * flow a defined "done" moment instead of a dialog that silently saves
 * fields and leaves the operator wondering whether they're finished.
 *
 * Guards:
 *   - Legal name must be set (always required)
 *   - At least one primary contact must exist (so invoices have a human
 *     to chase)
 *   - If VAT treatment = STANDARD, billing email must be set (otherwise
 *     invoices have nowhere to go)
 */
export async function markEmployerOnboardingComplete(employerId: string): Promise<Employer> {
  const session = await requireRecruitment('employers', 'edit');
  return db.transaction(async (tx) => {
    const [emp] = await tx.select().from(employers).where(eq(employers.id, employerId)).limit(1);
    if (!emp) throw new BusinessRuleError('EMPLOYER_NOT_FOUND', 'Employer not found');
    if (emp.onboardingCompletedAt) return emp; // Idempotent

    const [primary] = await tx
      .select({ id: employerContacts.id })
      .from(employerContacts)
      .where(and(eq(employerContacts.employerId, employerId), eq(employerContacts.isPrimary, true)))
      .limit(1);
    if (!primary) {
      throw new BusinessRuleError(
        'MISSING_PRIMARY_CONTACT',
        'Add a primary contact before marking onboarding complete.',
      );
    }

    if (emp.vatTreatment === 'STANDARD' && !emp.billingEmail) {
      throw new BusinessRuleError(
        'MISSING_BILLING_EMAIL',
        'An invoice email is required for Standard VAT treatment. Add one under Billing & VAT.',
      );
    }

    const now = new Date();
    const [after] = await tx
      .update(employers)
      .set({
        onboardingCompletedAt: now,
        relationshipStatus:
          emp.relationshipStatus === 'PROSPECT' ? 'ACTIVE' : emp.relationshipStatus,
        updatedAt: sql`NOW()`,
      })
      .where(eq(employers.id, employerId))
      .returning();
    if (!after) throw new Error('update returned no row');

    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'employer',
      entityId: after.id,
      action: 'ONBOARDING_COMPLETED',
      before: {
        relationshipStatus: emp.relationshipStatus,
      },
      after: {
        relationshipStatus: after.relationshipStatus,
        onboardingCompletedAt: after.onboardingCompletedAt?.toISOString() ?? null,
      },
    });

    return after;
  });
}

/**
 * R1 — contacts gained delete. Hard delete with a full before-snapshot
 * in the audit trail (same pattern as checklist DELETED events), so the
 * record of who was removed, by whom and when survives the row.
 */
/**
 * R1 — the workspace Activity tab: the audit trail touching this
 * employer (the record itself, its contacts, and its requisitions),
 * newest first. entity_id is text in audit_events, so ids are compared
 * as strings.
 */
export async function fetchEmployerActivity(
  employerId: string,
  opts?: { limit?: number },
): Promise<
  Array<{
    id: string;
    occurredAt: Date;
    actorName: string | null;
    entityType: string;
    action: string;
    summary: string;
  }>
> {
  await requireInternalStaff();
  const limit = Math.min(opts?.limit ?? 30, 100);
  const contactIds = (
    await db
      .select({ id: employerContacts.id })
      .from(employerContacts)
      .where(eq(employerContacts.employerId, employerId))
  ).map((r) => r.id);
  const requisitionIds = (
    await db
      .select({ id: jobRequisitions.id })
      .from(jobRequisitions)
      .where(eq(jobRequisitions.employerId, employerId))
  ).map((r) => r.id);

  const conds: SQL[] = [
    and(eq(auditEvents.entityType, 'employer'), eq(auditEvents.entityId, employerId)) as SQL,
  ];
  // Contact events: live contacts by id, plus deleted contacts (and newer
  // events) through the employerId the contact service records.
  conds.push(
    and(
      eq(auditEvents.entityType, 'employer_contact'),
      or(
        contactIds.length > 0 ? inArray(auditEvents.entityId, contactIds) : undefined,
        sql`${auditEvents.before} ->> 'employerId' = ${employerId}`,
        sql`${auditEvents.context} ->> 'employerId' = ${employerId}`,
      ),
    ) as SQL,
  );
  if (requisitionIds.length > 0) {
    conds.push(
      and(
        eq(auditEvents.entityType, 'job_requisition'),
        inArray(auditEvents.entityId, requisitionIds),
      ) as SQL,
    );
  }

  const rows = await db
    .select({
      id: auditEvents.id,
      occurredAt: auditEvents.occurredAt,
      entityType: auditEvents.entityType,
      action: auditEvents.action,
      before: auditEvents.before,
      after: auditEvents.after,
      context: auditEvents.context,
      actorName: users.fullName,
    })
    .from(auditEvents)
    .leftJoin(users, eq(users.id, auditEvents.actorUserId))
    .where(or(...conds))
    .orderBy(desc(auditEvents.occurredAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    occurredAt: r.occurredAt,
    actorName: r.actorName,
    entityType: r.entityType,
    action: r.action,
    summary:
      r.entityType === 'employer_contact'
        ? describeContactEvent(r.action, r.before, r.after, r.context)
        : `${r.entityType.replace(/_/g, ' ')} ${r.action.replace(/_/g, ' ').toLowerCase()}`,
  }));
}

export async function deleteEmployerContact(contactId: string): Promise<void> {
  const session = await requireRecruitment('employers', 'edit');
  await db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(employerContacts)
      .where(eq(employerContacts.id, contactId))
      .limit(1);
    if (!before) throw new BusinessRuleError('CONTACT_NOT_FOUND', 'Contact not found');
    await tx.delete(employerContacts).where(eq(employerContacts.id, contactId));
    const [stillPrimary] = before.isPrimary
      ? await tx
          .select({ id: employerContacts.id })
          .from(employerContacts)
          .where(
            and(
              eq(employerContacts.employerId, before.employerId),
              eq(employerContacts.isPrimary, true),
            ),
          )
          .limit(1)
      : [];
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'employer_contact',
      entityId: contactId,
      action: 'DELETED',
      before: {
        employerId: before.employerId,
        fullName: before.fullName,
        jobTitle: before.jobTitle,
        email: before.email,
        phone: before.phone,
        isPrimary: before.isPrimary,
      },
      context: {
        employerId: before.employerId,
        // Deleting the primary leaves the employer without one; the Activity
        // line says so (removal is not refused — a contact can leave).
        leftWithoutPrimary: before.isPrimary && !stillPrimary,
      },
    });
  });
}

function contactSnapshot(c: EmployerContact) {
  return {
    employerId: c.employerId,
    fullName: c.fullName,
    jobTitle: c.jobTitle,
    email: c.email,
    phone: c.phone,
    isPrimary: c.isPrimary,
  };
}

export type ContactUpsertResult = EmployerContact & {
  /** Contacts that lost primary status because this one became primary. */
  replacedPrimary: Array<{ id: string; fullName: string }>;
};

/**
 * The employer's current primary contact (for the "This replaces …" hint
 * in the contact dialog). Null when the employer has none.
 */
export async function fetchPrimaryContact(
  employerId: string,
): Promise<{ id: string; fullName: string } | null> {
  // Only people who can edit contacts open the dialog that asks.
  await requireRecruitment('employers', 'edit');
  const [row] = await db
    .select({ id: employerContacts.id, fullName: employerContacts.fullName })
    .from(employerContacts)
    .where(and(eq(employerContacts.employerId, employerId), eq(employerContacts.isPrimary, true)))
    .orderBy(asc(employerContacts.fullName))
    .limit(1);
  return row ?? null;
}

export async function upsertEmployerContact(
  input: UpsertContactInput,
): Promise<ContactUpsertResult> {
  const session = await requireRecruitment('employers', 'edit');
  const parsed = UpsertContactSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid contact',
      parsed.error.flatten().fieldErrors as Record<string, string>,
    );
  }
  const d = parsed.data;
  const values = {
    employerId: d.employerId,
    fullName: d.fullName.trim(),
    jobTitle: blankToNull(d.jobTitle),
    email: blankToNull(d.email),
    phone: blankToNull(d.phone),
    isPrimary: d.isPrimary,
  };

  return db.transaction(async (tx) => {
    // Serialise contact changes per employer (row lock on the employer), so
    // two people ticking "Primary" at once cannot leave two primaries.
    const [employer] = await tx
      .select({ id: employers.id })
      .from(employers)
      .where(eq(employers.id, d.employerId))
      .for('update');
    if (!employer) throw new BusinessRuleError('EMPLOYER_NOT_FOUND', 'Employer not found');

    let before: EmployerContact | undefined;
    if (d.id) {
      [before] = await tx
        .select()
        .from(employerContacts)
        .where(eq(employerContacts.id, d.id))
        .limit(1);
      if (!before) throw new BusinessRuleError('CONTACT_NOT_FOUND', 'Contact not found');
      if (before.employerId !== d.employerId) {
        throw new BusinessRuleError(
          'CONTACT_EMPLOYER_MISMATCH',
          'This contact belongs to a different employer.',
        );
      }
    }

    // Making this contact primary demotes every other primary of the employer.
    let replacedPrimary: Array<{ id: string; fullName: string }> = [];
    if (d.isPrimary) {
      const others = and(
        eq(employerContacts.employerId, d.employerId),
        eq(employerContacts.isPrimary, true),
        d.id ? ne(employerContacts.id, d.id) : undefined,
      );
      replacedPrimary = await tx
        .update(employerContacts)
        .set({ isPrimary: false, updatedAt: sql`NOW()` })
        .where(others)
        .returning({ id: employerContacts.id, fullName: employerContacts.fullName });
      for (const c of replacedPrimary) {
        await recordAudit(tx, {
          actorUserId: session.user.id,
          entityType: 'employer_contact',
          entityId: c.id,
          action: 'UPDATED',
          before: { fullName: c.fullName, isPrimary: true },
          after: { fullName: c.fullName, isPrimary: false },
          context: {
            via: 'primary_contact_change',
            employerId: d.employerId,
            replacedBy: { id: d.id ?? null, fullName: values.fullName },
          },
        });
      }
    }
    const context = {
      employerId: d.employerId,
      ...(replacedPrimary.length > 0 && { replacedPrimary }),
    };

    if (before) {
      const [after] = await tx
        .update(employerContacts)
        .set({ ...values, updatedAt: sql`NOW()` })
        .where(eq(employerContacts.id, before.id))
        .returning();
      if (!after) throw new Error('update returned no row');
      await recordAudit(tx, {
        actorUserId: session.user.id,
        entityType: 'employer_contact',
        entityId: after.id,
        action: 'UPDATED',
        before: contactSnapshot(before),
        after: contactSnapshot(after),
        context,
      });
      return { ...after, replacedPrimary };
    }
    const [created] = await tx.insert(employerContacts).values(values).returning();
    if (!created) throw new Error('insert returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'employer_contact',
      entityId: created.id,
      action: 'CREATED',
      after: contactSnapshot(created),
      context,
    });
    return { ...created, replacedPrimary };
  });
}

/** Soft-archive an employer. List queries filter archived rows out; the record itself is untouched. */
export async function archiveEmployer(input: ArchiveEmployerInput): Promise<Employer> {
  const session = await requireRecruitment('employers', 'edit');
  const parsed = ArchiveEmployerSchema.parse(input);
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(employers)
      .where(eq(employers.id, parsed.employerId))
      .limit(1);
    if (!before) throw new BusinessRuleError('EMPLOYER_NOT_FOUND', 'Employer not found');
    if (before.archivedAt) {
      throw new BusinessRuleError('ALREADY_ARCHIVED', 'Employer is already archived');
    }
    const [after] = await tx
      .update(employers)
      .set({ archivedAt: new Date(), updatedAt: sql`NOW()` })
      .where(eq(employers.id, parsed.employerId))
      .returning();
    if (!after) throw new Error('archive returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'employer',
      entityId: after.id,
      action: 'ARCHIVED',
      before: { archivedAt: null },
      after: { archivedAt: after.archivedAt },
      context: { reason: parsed.reason },
    });
    return after;
  });
}

/** Restore a previously archived employer back to the active list. */
export async function unarchiveEmployer(input: UnarchiveEmployerInput): Promise<Employer> {
  const session = await requireRecruitment('employers', 'edit');
  const parsed = UnarchiveEmployerSchema.parse(input);
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(employers)
      .where(eq(employers.id, parsed.employerId))
      .limit(1);
    if (!before) throw new BusinessRuleError('EMPLOYER_NOT_FOUND', 'Employer not found');
    if (!before.archivedAt) {
      throw new BusinessRuleError('NOT_ARCHIVED', 'Employer is not archived');
    }
    const [after] = await tx
      .update(employers)
      .set({ archivedAt: null, updatedAt: sql`NOW()` })
      .where(eq(employers.id, parsed.employerId))
      .returning();
    if (!after) throw new Error('unarchive returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'employer',
      entityId: after.id,
      action: 'UNARCHIVED',
      before: { archivedAt: before.archivedAt },
      after: { archivedAt: null },
      context: { reason: parsed.reason },
    });
    return after;
  });
}

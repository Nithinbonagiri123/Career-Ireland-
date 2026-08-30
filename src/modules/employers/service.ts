import { and, asc, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { recordAudit } from '@/lib/audit/withAudit';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import {
  type Employer,
  type EmployerContact,
  employerContacts,
  employers,
} from '@/lib/db/schema/recruitment';
import { BusinessRuleError, ValidationError } from '@/lib/errors';
import { type AssignmentScope, assignmentCondition } from '@/lib/scope';
import {
  type UpsertContactInput,
  UpsertContactSchema,
  type UpsertEmployerInput,
  UpsertEmployerSchema,
} from './schemas';

function blankToNull(v: string | undefined | null): string | null {
  return v && v.trim().length > 0 ? v : null;
}

export async function fetchEmployers(scope?: AssignmentScope): Promise<Employer[]> {
  const session = await requireRole(['ADMIN', 'STAFF']);
  const scopeCond = scope
    ? assignmentCondition(scope, employers.assignedUserId, session.user.id)
    : undefined;
  return db
    .select()
    .from(employers)
    .where(scopeCond ? and(isNull(employers.archivedAt), scopeCond) : isNull(employers.archivedAt))
    .orderBy(desc(employers.createdAt));
}

export async function fetchEmployer(id: string): Promise<Employer | null> {
  await requireRole(['ADMIN', 'STAFF']);
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
  await requireRole(['ADMIN', 'STAFF']);
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
  await requireRole(['ADMIN', 'STAFF']);
  return db
    .select()
    .from(employerContacts)
    .where(eq(employerContacts.employerId, employerId))
    .orderBy(desc(employerContacts.isPrimary), asc(employerContacts.fullName));
}

export async function upsertEmployer(input: UpsertEmployerInput): Promise<Employer> {
  const session = await requireRole(['ADMIN', 'STAFF']);
  const parsed = UpsertEmployerSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid employer',
      parsed.error.flatten().fieldErrors as Record<string, string>,
    );
  }
  const d = parsed.data;
  const values = {
    legalName: d.legalName.trim(),
    tradingName: blankToNull(d.tradingName),
    website: blankToNull(d.website),
    industry: blankToNull(d.industry),
    country: blankToNull(d.country),
    city: blankToNull(d.city),
    relationshipStatus: d.relationshipStatus,
    assignedUserId: blankToNull(d.assignedUserId),
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
        before: {
          legalName: before.legalName,
          relationshipStatus: before.relationshipStatus,
        },
        after: { legalName: after.legalName, relationshipStatus: after.relationshipStatus },
      });
      return after;
    }
    const [created] = await tx.insert(employers).values(values).returning();
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

export async function upsertEmployerContact(input: UpsertContactInput): Promise<EmployerContact> {
  const session = await requireRole(['ADMIN', 'STAFF']);
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
    // If this contact is being made primary, unset any other primary for the same employer.
    if (d.isPrimary) {
      await tx
        .update(employerContacts)
        .set({ isPrimary: false, updatedAt: sql`NOW()` })
        .where(
          and(eq(employerContacts.employerId, d.employerId), eq(employerContacts.isPrimary, true)),
        );
    }

    if (d.id) {
      const [before] = await tx
        .select()
        .from(employerContacts)
        .where(eq(employerContacts.id, d.id))
        .limit(1);
      if (!before) throw new BusinessRuleError('CONTACT_NOT_FOUND', 'Contact not found');
      const [after] = await tx
        .update(employerContacts)
        .set({ ...values, updatedAt: sql`NOW()` })
        .where(eq(employerContacts.id, d.id))
        .returning();
      if (!after) throw new Error('update returned no row');
      await recordAudit(tx, {
        actorUserId: session.user.id,
        entityType: 'employer_contact',
        entityId: after.id,
        action: 'UPDATED',
        before: { fullName: before.fullName, isPrimary: before.isPrimary },
        after: { fullName: after.fullName, isPrimary: after.isPrimary },
      });
      return after;
    }
    const [created] = await tx.insert(employerContacts).values(values).returning();
    if (!created) throw new Error('insert returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'employer_contact',
      entityId: created.id,
      action: 'CREATED',
      after: { employerId: created.employerId, fullName: created.fullName },
    });
    return created;
  });
}

import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
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
import {
  type UpsertContactInput,
  UpsertContactSchema,
  type UpsertEmployerInput,
  UpsertEmployerSchema,
} from './schemas';

function blankToNull(v: string | undefined | null): string | null {
  return v && v.trim().length > 0 ? v : null;
}

export async function fetchEmployers(): Promise<Employer[]> {
  await requireRole(['ADMIN', 'STAFF']);
  return db
    .select()
    .from(employers)
    .where(isNull(employers.archivedAt))
    .orderBy(desc(employers.createdAt));
}

export async function fetchEmployer(id: string): Promise<Employer | null> {
  await requireRole(['ADMIN', 'STAFF']);
  const [row] = await db.select().from(employers).where(eq(employers.id, id)).limit(1);
  return row ?? null;
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

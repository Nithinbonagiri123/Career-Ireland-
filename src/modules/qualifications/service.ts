import { asc, eq, sql } from 'drizzle-orm';
import { recordAudit } from '@/lib/audit/withAudit';
import { requireInternalStaff, requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { type Qualification, qualifications } from '@/lib/db/schema/reference';
import { BusinessRuleError, ValidationError } from '@/lib/errors';
import {
  type SetActiveByIdInput,
  SetActiveByIdSchema,
  type UpsertQualificationInput,
  UpsertQualificationSchema,
} from './schemas';

export async function fetchQualifications(): Promise<Qualification[]> {
  await requireInternalStaff();
  return db.select().from(qualifications).orderBy(asc(qualifications.name));
}

async function getById(id: string): Promise<Qualification | null> {
  const [row] = await db.select().from(qualifications).where(eq(qualifications.id, id)).limit(1);
  return row ?? null;
}

export async function upsertQualification(input: UpsertQualificationInput): Promise<Qualification> {
  const session = await requireRole(['ADMIN']);
  const parsed = UpsertQualificationSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid qualification',
      parsed.error.flatten().fieldErrors as Record<string, string>,
    );
  }
  const data = parsed.data;

  return db.transaction(async (tx) => {
    if (data.id) {
      const existing = await getById(data.id);
      if (!existing) throw new BusinessRuleError('QUALIFICATION_NOT_FOUND', 'Not found');
      if (existing.name === data.name && existing.isActive === data.isActive) return existing;
      const [after] = await tx
        .update(qualifications)
        .set({ name: data.name, isActive: data.isActive, updatedAt: sql`NOW()` })
        .where(eq(qualifications.id, data.id))
        .returning();
      if (!after) throw new Error('update returned no row');
      await recordAudit(tx, {
        actorUserId: session.user.id,
        entityType: 'qualification',
        entityId: after.id,
        action: 'UPDATED',
        before: { name: existing.name, isActive: existing.isActive },
        after: { name: after.name, isActive: after.isActive },
      });
      return after;
    }
    const [created] = await tx
      .insert(qualifications)
      .values({ name: data.name, isActive: data.isActive })
      .returning();
    if (!created) throw new Error('insert returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'qualification',
      entityId: created.id,
      action: 'CREATED',
      after: { name: created.name },
    });
    return created;
  });
}

export async function setQualificationActive(input: SetActiveByIdInput): Promise<Qualification> {
  const session = await requireRole(['ADMIN']);
  const parsed = SetActiveByIdSchema.parse(input);
  return db.transaction(async (tx) => {
    const existing = await getById(parsed.id);
    if (!existing) throw new BusinessRuleError('QUALIFICATION_NOT_FOUND', 'Not found');
    if (existing.isActive === parsed.isActive) return existing;
    const [after] = await tx
      .update(qualifications)
      .set({ isActive: parsed.isActive, updatedAt: sql`NOW()` })
      .where(eq(qualifications.id, parsed.id))
      .returning();
    if (!after) throw new Error('update returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'qualification',
      entityId: after.id,
      action: parsed.isActive ? 'ACTIVATED' : 'DEACTIVATED',
      before: { isActive: existing.isActive },
      after: { isActive: after.isActive },
    });
    return after;
  });
}

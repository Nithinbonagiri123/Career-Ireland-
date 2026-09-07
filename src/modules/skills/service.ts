import { asc, eq, sql } from 'drizzle-orm';
import { recordAudit } from '@/lib/audit/withAudit';
import { requireInternalStaff, requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { type Skill, skills } from '@/lib/db/schema/reference';
import { BusinessRuleError, ValidationError } from '@/lib/errors';
import {
  type SetActiveByIdInput,
  SetActiveByIdSchema,
  type UpsertSkillInput,
  UpsertSkillSchema,
} from './schemas';

export async function fetchSkills(): Promise<Skill[]> {
  await requireInternalStaff();
  return db.select().from(skills).orderBy(asc(skills.name));
}

async function getById(id: string): Promise<Skill | null> {
  const [row] = await db.select().from(skills).where(eq(skills.id, id)).limit(1);
  return row ?? null;
}

export async function upsertSkill(input: UpsertSkillInput): Promise<Skill> {
  const session = await requireRole(['ADMIN']);
  const parsed = UpsertSkillSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid skill',
      parsed.error.flatten().fieldErrors as Record<string, string>,
    );
  }
  const data = parsed.data;

  return db.transaction(async (tx) => {
    if (data.id) {
      const existing = await getById(data.id);
      if (!existing) throw new BusinessRuleError('SKILL_NOT_FOUND', 'Skill not found');
      if (existing.name === data.name && existing.isActive === data.isActive) return existing;
      const [after] = await tx
        .update(skills)
        .set({ name: data.name, isActive: data.isActive, updatedAt: sql`NOW()` })
        .where(eq(skills.id, data.id))
        .returning();
      if (!after) throw new Error('update returned no row');
      await recordAudit(tx, {
        actorUserId: session.user.id,
        entityType: 'skill',
        entityId: after.id,
        action: 'UPDATED',
        before: { name: existing.name, isActive: existing.isActive },
        after: { name: after.name, isActive: after.isActive },
      });
      return after;
    }
    const [created] = await tx
      .insert(skills)
      .values({ name: data.name, isActive: data.isActive })
      .returning();
    if (!created) throw new Error('insert returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'skill',
      entityId: created.id,
      action: 'CREATED',
      after: { name: created.name },
    });
    return created;
  });
}

export async function setSkillActive(input: SetActiveByIdInput): Promise<Skill> {
  const session = await requireRole(['ADMIN']);
  const parsed = SetActiveByIdSchema.parse(input);
  return db.transaction(async (tx) => {
    const existing = await getById(parsed.id);
    if (!existing) throw new BusinessRuleError('SKILL_NOT_FOUND', 'Skill not found');
    if (existing.isActive === parsed.isActive) return existing;
    const [after] = await tx
      .update(skills)
      .set({ isActive: parsed.isActive, updatedAt: sql`NOW()` })
      .where(eq(skills.id, parsed.id))
      .returning();
    if (!after) throw new Error('update returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'skill',
      entityId: after.id,
      action: parsed.isActive ? 'ACTIVATED' : 'DEACTIVATED',
      before: { isActive: existing.isActive },
      after: { isActive: after.isActive },
    });
    return after;
  });
}

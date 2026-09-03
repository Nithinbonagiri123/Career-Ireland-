import { eq, sql } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import { recordAudit } from '@/lib/audit/withAudit';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { immigrationCases } from '@/lib/db/schema/immigration';
import { leads } from '@/lib/db/schema/leads';
import { candidateProfiles } from '@/lib/db/schema/persons';
import { employers, jobRequisitions } from '@/lib/db/schema/recruitment';
import { BusinessRuleError } from '@/lib/errors';

export type AssignableEntity =
  | 'candidate'
  | 'lead'
  | 'requisition'
  | 'employer'
  | 'immigration_case';

/**
 * Table + assignment column + audit label for each assignable entity type.
 * Note: 'candidate' resolves via the person_id → candidate_profiles.person_id lookup
 * (callers pass the personId, not the profileId).
 */
type TargetMeta = {
  table: PgTable;
  keyColumn: PgColumn;
  assignedColumn: PgColumn;
  auditType: string;
};

const TARGETS: Record<AssignableEntity, TargetMeta> = {
  candidate: {
    table: candidateProfiles,
    keyColumn: candidateProfiles.personId,
    assignedColumn: candidateProfiles.assignedUserId,
    auditType: 'candidate_profile',
  },
  lead: {
    table: leads,
    keyColumn: leads.id,
    assignedColumn: leads.assignedUserId,
    auditType: 'lead',
  },
  requisition: {
    table: jobRequisitions,
    keyColumn: jobRequisitions.id,
    assignedColumn: jobRequisitions.assignedUserId,
    auditType: 'job_requisition',
  },
  employer: {
    table: employers,
    keyColumn: employers.id,
    assignedColumn: employers.assignedUserId,
    auditType: 'employer',
  },
  immigration_case: {
    table: immigrationCases,
    keyColumn: immigrationCases.id,
    assignedColumn: immigrationCases.assignedUserId,
    auditType: 'immigration_case',
  },
};

/**
 * Set (or clear) the assignedUserId on an entity. Idempotent — no-op if already
 * assigned to the same user. Records an audit event on every change.
 */
export async function assignEntity(input: {
  entity: AssignableEntity;
  id: string;
  userId: string | null;
}): Promise<{ before: string | null; after: string | null } | null> {
  const session = await requireRole(['ADMIN', 'STAFF']);
  const target = TARGETS[input.entity];
  if (!target) throw new BusinessRuleError('BAD_ENTITY', `Unknown entity: ${input.entity}`);

  return db.transaction(async (tx) => {
    const [before] = await tx
      // biome-ignore lint/suspicious/noExplicitAny: polymorphic — target is one of five tables
      .select({ id: target.keyColumn, assignedUserId: target.assignedColumn } as any)
      .from(target.table)
      .where(eq(target.keyColumn, input.id))
      .limit(1);
    if (!before) throw new BusinessRuleError('NOT_FOUND', 'Record not found');

    const beforeUserId = (before as { assignedUserId: string | null }).assignedUserId;
    if (beforeUserId === input.userId) return null;

    // All five assignable tables happen to name the field `assignedUserId` (JS) →
    // `assigned_user_id` (DB). Drizzle's .set() takes the JS field name, so we
    // hardcode it rather than dereferencing target.assignedColumn.name (which
    // returns the DB column name and gets silently dropped by drizzle).
    await tx
      .update(target.table)
      // biome-ignore lint/suspicious/noExplicitAny: polymorphic table — set-key type widened
      .set({ assignedUserId: input.userId, updatedAt: sql`NOW()` } as any)
      .where(eq(target.keyColumn, input.id));

    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: target.auditType,
      entityId: input.id,
      action: input.userId ? 'ASSIGNED' : 'UNASSIGNED',
      before: { assignedUserId: beforeUserId },
      after: { assignedUserId: input.userId },
      context: {
        assignedToSelf: input.userId === session.user.id,
      },
    });

    return { before: beforeUserId, after: input.userId };
  });
}

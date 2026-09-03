import { inArray, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { recordAudit } from '@/lib/audit/withAudit';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { candidateProfiles } from '@/lib/db/schema/persons';
import { ValidationError } from '@/lib/errors';
import {
  type BulkAssignCandidatesInput,
  BulkAssignCandidatesSchema,
  type BulkUpdateLifecycleInput,
  BulkUpdateLifecycleSchema,
  type LifecycleStatusSchema,
} from './schemas';

export type LifecycleStatus = z.infer<typeof LifecycleStatusSchema>;

/**
 * Assign (or clear) the responsible recruiter on many candidates at once.
 * Runs in a single transaction; emits one audit event per changed profile so
 * per-record history stays granular.
 * Returns the count of profiles actually changed (unchanged rows are silently skipped).
 */
export async function bulkAssignCandidates(
  input: BulkAssignCandidatesInput,
): Promise<{ changed: number }> {
  const session = await requireRole(['ADMIN', 'STAFF']);
  const parsed = BulkAssignCandidatesSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid bulk assign input',
      parsed.error.flatten().fieldErrors as Record<string, string>,
    );
  }
  const { personIds, userId } = parsed.data;

  return db.transaction(async (tx) => {
    // Fetch current values so we can (a) skip no-ops and (b) record before/after.
    const rows = await tx
      .select({
        id: candidateProfiles.id,
        personId: candidateProfiles.personId,
        assignedUserId: candidateProfiles.assignedUserId,
      })
      .from(candidateProfiles)
      .where(inArray(candidateProfiles.personId, personIds));

    const toChange = rows.filter((r) => r.assignedUserId !== userId);
    if (toChange.length === 0) return { changed: 0 };

    const ids = toChange.map((r) => r.id);
    await tx
      .update(candidateProfiles)
      .set({ assignedUserId: userId, updatedAt: sql`NOW()` })
      .where(inArray(candidateProfiles.id, ids));

    for (const row of toChange) {
      await recordAudit(tx, {
        actorUserId: session.user.id,
        entityType: 'candidate_profile',
        entityId: row.id,
        action: userId ? 'ASSIGNED' : 'UNASSIGNED',
        before: { assignedUserId: row.assignedUserId },
        after: { assignedUserId: userId },
        context: { bulk: true, batchSize: toChange.length },
      });
    }
    return { changed: toChange.length };
  });
}

/**
 * Bulk-set lifecycle status on many candidates. Idempotent; unchanged rows skipped.
 * Note: does NOT touch availabilityStatus — those are two independent lifecycles.
 */
export async function bulkUpdateCandidateLifecycle(
  input: BulkUpdateLifecycleInput,
): Promise<{ changed: number }> {
  const session = await requireRole(['ADMIN', 'STAFF']);
  const parsed = BulkUpdateLifecycleSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid bulk lifecycle input',
      parsed.error.flatten().fieldErrors as Record<string, string>,
    );
  }
  const { personIds, lifecycleStatus } = parsed.data;

  return db.transaction(async (tx) => {
    const rows = await tx
      .select({
        id: candidateProfiles.id,
        personId: candidateProfiles.personId,
        lifecycleStatus: candidateProfiles.lifecycleStatus,
      })
      .from(candidateProfiles)
      // We filter no-ops in memory below so we can emit per-row audit events cleanly.
      .where(inArray(candidateProfiles.personId, personIds));

    const toChange = rows.filter((r) => r.lifecycleStatus !== lifecycleStatus);
    if (toChange.length === 0) return { changed: 0 };

    const ids = toChange.map((r) => r.id);
    await tx
      .update(candidateProfiles)
      .set({ lifecycleStatus, updatedAt: sql`NOW()` })
      .where(inArray(candidateProfiles.id, ids));

    for (const row of toChange) {
      await recordAudit(tx, {
        actorUserId: session.user.id,
        entityType: 'candidate_profile',
        entityId: row.id,
        action: 'LIFECYCLE_CHANGED',
        before: { lifecycleStatus: row.lifecycleStatus },
        after: { lifecycleStatus },
        context: { bulk: true, batchSize: toChange.length },
      });
    }
    return { changed: toChange.length };
  });
}

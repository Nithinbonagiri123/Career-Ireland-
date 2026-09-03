import { z } from 'zod';

/**
 * Zod schemas for bulk candidate mutations. Wraps the two bulk actions
 * (assign + lifecycle) so malformed input rejects at the action boundary
 * with a specific field-level error instead of tripping a DB constraint
 * and surfacing as a generic INTERNAL_ERROR.
 */

export const LifecycleStatusSchema = z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']);

const MAX_BULK_SIZE = 200;

export const BulkAssignCandidatesSchema = z.object({
  personIds: z.array(z.string().uuid()).min(1).max(MAX_BULK_SIZE),
  userId: z.string().uuid().nullable(),
});

export const BulkUpdateLifecycleSchema = z.object({
  personIds: z.array(z.string().uuid()).min(1).max(MAX_BULK_SIZE),
  lifecycleStatus: LifecycleStatusSchema,
});

export type BulkAssignCandidatesInput = z.infer<typeof BulkAssignCandidatesSchema>;
export type BulkUpdateLifecycleInput = z.infer<typeof BulkUpdateLifecycleSchema>;

import { z } from 'zod';

export const AuditListQuerySchema = z.object({
  entityType: z.string().max(80).optional(),
  actorUserId: z.string().uuid().optional(),
  /** Filter by action verb (e.g. LOGIN, EXPORTED, DELETED, AUTH_DENIED). */
  action: z.string().max(80).optional(),
  /** Inclusive lower bound on `occurredAt`. */
  from: z.string().datetime().optional(),
  /** Exclusive upper bound on `occurredAt`. */
  to: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(200).default(50),
  cursor: z
    .object({
      occurredAt: z.string().datetime(),
      id: z.string().uuid(),
    })
    .optional(),
});

export type AuditListQuery = z.infer<typeof AuditListQuerySchema>;

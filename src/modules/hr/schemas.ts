import { z } from 'zod';

/**
 * Zod schemas for HR endpoints. Timestamps are NEVER accepted from the
 * caller — attendance times are always server-generated. The only
 * caller-supplied timestamps live in `CorrectAttendanceSchema` because
 * corrections by definition mean an admin is entering the true value
 * after the fact.
 */

export const ClockInSchema = z
  .object({
    /** Optional caller IP for audit only; NOT trusted, filled by server. */
    _ip: z.string().optional(),
  })
  .strict();

export type ClockInInput = z.infer<typeof ClockInSchema>;

export const ClockOutSchema = z
  .object({
    _ip: z.string().optional(),
  })
  .strict();

export type ClockOutInput = z.infer<typeof ClockOutSchema>;

export const CorrectAttendanceSchema = z
  .object({
    sessionId: z.string().uuid(),
    clockInAt: z.string().datetime().optional(),
    clockOutAt: z.string().datetime().nullable().optional(),
    reason: z.string().min(3, 'Reason must be at least 3 characters.').max(500),
  })
  .strict()
  .refine((v) => v.clockInAt !== undefined || v.clockOutAt !== undefined, {
    message: 'At least one of clockInAt / clockOutAt must be provided.',
  });

export type CorrectAttendanceInput = z.infer<typeof CorrectAttendanceSchema>;

export const UpsertStaffProfileSchema = z
  .object({
    userId: z.string().uuid(),
    department: z.string().max(120).optional(),
    position: z.string().max(120).optional(),
    joiningDate: z.string().date().optional(),
    managerUserId: z.string().uuid().optional().nullable(),
    status: z.enum(['ACTIVE', 'ON_LEAVE', 'TERMINATED']).optional(),
  })
  .strict();

export type UpsertStaffProfileInput = z.infer<typeof UpsertStaffProfileSchema>;

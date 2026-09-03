import { z } from 'zod';

const uuid = z.string().uuid();
const blank = z.literal('');

export const InterviewModeSchema = z.enum(['PHONE', 'VIDEO', 'IN_PERSON', 'PANEL']);
export const InterviewStatusSchema = z.enum([
  'SCHEDULED',
  'COMPLETED',
  'NO_SHOW',
  'RESCHEDULED',
  'CANCELLED',
]);
export const InterviewOutcomeSchema = z.enum(['PENDING', 'PASS', 'FAIL', 'HOLD']);

/**
 * Accepts an ISO datetime string OR the browser <input type="datetime-local"> shape
 * (`YYYY-MM-DDTHH:mm[:ss]` with no timezone). Rejects anything that `new Date(v)`
 * would parse to `Invalid Date` — catches the failure at the action boundary so
 * callers get a field-level error instead of a downstream 500.
 */
const datetimeString = z
  .string()
  .min(1, 'Required')
  .refine((v) => !Number.isNaN(new Date(v).getTime()), 'Invalid date/time');

export const ScheduleInterviewSchema = z.object({
  jobApplicationId: uuid,
  /** ISO datetime string (from datetime-local input). */
  scheduledAt: datetimeString,
  durationMinutes: z.coerce.number().int().min(5).max(600).optional().nullable(),
  mode: InterviewModeSchema.default('VIDEO'),
  round: z.coerce.number().int().min(1).max(20).default(1),
  location: z.string().max(500).optional().or(blank),
  interviewerNames: z.string().max(500).optional().or(blank),
  notes: z.string().max(2000).optional().or(blank),
});

export const UpdateInterviewSchema = z.object({
  id: uuid,
  status: InterviewStatusSchema,
  outcome: InterviewOutcomeSchema,
  notes: z.string().max(2000).optional().or(blank),
});

export const RescheduleInterviewSchema = z.object({
  id: uuid,
  scheduledAt: datetimeString,
  location: z.string().max(500).optional().or(blank),
});

export const RemoveInterviewSchema = z.object({ id: uuid });

export type ScheduleInterviewInput = z.infer<typeof ScheduleInterviewSchema>;
export type UpdateInterviewInput = z.infer<typeof UpdateInterviewSchema>;
export type RescheduleInterviewInput = z.infer<typeof RescheduleInterviewSchema>;
export type RemoveInterviewInput = z.infer<typeof RemoveInterviewSchema>;

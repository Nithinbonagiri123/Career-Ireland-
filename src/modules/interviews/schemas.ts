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

export const ScheduleInterviewSchema = z.object({
  jobApplicationId: uuid,
  /** ISO datetime string (from datetime-local input). */
  scheduledAt: z.string().min(1),
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
  scheduledAt: z.string().min(1),
  location: z.string().max(500).optional().or(blank),
});

export const RemoveInterviewSchema = z.object({ id: uuid });

export type ScheduleInterviewInput = z.infer<typeof ScheduleInterviewSchema>;
export type UpdateInterviewInput = z.infer<typeof UpdateInterviewSchema>;
export type RescheduleInterviewInput = z.infer<typeof RescheduleInterviewSchema>;
export type RemoveInterviewInput = z.infer<typeof RemoveInterviewSchema>;

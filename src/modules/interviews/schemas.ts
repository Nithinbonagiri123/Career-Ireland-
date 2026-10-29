import { z } from 'zod';

const blankToUndef = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const optionalText = (max: number) =>
  z.preprocess(blankToUndef, z.string().trim().max(max).optional());

export const INTERVIEW_MODES = ['PHONE', 'VIDEO', 'IN_PERSON', 'PANEL'] as const;

/** Wall-clock time + the timezone it is in; converted to an instant server-side. */
const When = {
  localDateTime: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Enter a date and time'),
  timeZone: z.string().min(1).max(64),
};

const Details = {
  durationMinutes: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
    z.number().int().min(5, 'At least 5 minutes').max(480, 'At most 8 hours').optional(),
  ),
  mode: z.enum(INTERVIEW_MODES),
  /** Address for in-person, meeting link for video/phone bridge. */
  location: optionalText(500),
  interviewerNames: optionalText(500),
  notes: optionalText(4000),
};

export const ScheduleInterviewSchema = z.object({
  applicationId: z.string().uuid(),
  ...When,
  ...Details,
});
export type ScheduleInterviewInput = z.input<typeof ScheduleInterviewSchema>;

export const UpdateInterviewSchema = z.object({
  interviewId: z.string().uuid(),
  ...When,
  ...Details,
});
export type UpdateInterviewInput = z.input<typeof UpdateInterviewSchema>;

export const CancelInterviewSchema = z.object({
  interviewId: z.string().uuid(),
  reason: z.string().trim().min(3, 'Give a reason (at least 3 characters)').max(500),
});
export type CancelInterviewInput = z.input<typeof CancelInterviewSchema>;

export const RecordInterviewResultSchema = z
  .object({
    interviewId: z.string().uuid(),
    result: z.enum(['COMPLETED', 'NO_SHOW']),
    outcome: z.enum(['PASS', 'FAIL', 'HOLD']).optional(),
    feedback: optionalText(4000),
  })
  .refine((d) => d.result === 'NO_SHOW' || Boolean(d.outcome), {
    message: 'Choose an outcome',
    path: ['outcome'],
  });
export type RecordInterviewResultInput = z.input<typeof RecordInterviewResultSchema>;

/** Update outcome / add feedback to an interview that already happened. */
export const UpdateInterviewFeedbackSchema = z.object({
  interviewId: z.string().uuid(),
  outcome: z.enum(['PASS', 'FAIL', 'HOLD']),
  feedback: optionalText(4000),
});
export type UpdateInterviewFeedbackInput = z.input<typeof UpdateInterviewFeedbackSchema>;

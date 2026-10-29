import { z } from 'zod';

const uuid = z.string().uuid();

/** Default minimum score for new matches (scores run 0–100). */
export const DEFAULT_MIN_SCORE = 50;

export const RunMatchingSchema = z.object({
  requisitionId: uuid,
  /** Off by default: confirmed-placed and explicitly unavailable candidates are left out. */
  includeUnavailable: z.boolean().optional(),
  /**
   * Scores run 0–100. Only NEW matches at or above this are created;
   * existing matches are always refreshed and never removed.
   */
  minScore: z
    .number({ error: 'Enter a minimum score from 0 to 100' })
    .int('Enter a whole number')
    .min(0, 'The minimum score cannot be below 0')
    .max(100, 'The minimum score cannot be above 100')
    .default(DEFAULT_MIN_SCORE),
});

/** A removal reason must say something: at least 5 characters, not just punctuation. */
export const RemoveFromShortlistSchema = z.object({
  shortlistEntryId: uuid,
  reason: z
    .string()
    .trim()
    .min(5, 'Give a reason of at least 5 characters')
    .max(500, 'Keep the reason under 500 characters')
    .refine((v) => /[\p{L}\p{N}]{3}/u.test(v), 'Give a meaningful reason'),
});

export const RecordPresentedSchema = z.object({
  shortlistEntryId: uuid,
  /** Day the candidate was presented to the employer (Irish date). */
  presentedOn: z.string().date('Enter the date the candidate was presented'),
});

export const RecordFeedbackSchema = z.object({
  shortlistEntryId: uuid,
  feedback: z
    .string()
    .trim()
    .min(3, 'Write at least 3 characters')
    .max(2000, 'Keep the feedback under 2000 characters'),
});

export const MatchFiltersSchema = z.object({
  q: z.string().trim().max(100).optional(),
  requisitionId: uuid.optional(),
  status: z.enum(['open', 'shortlisted', 'dismissed', 'all']).optional(),
  bucket: z.enum(['HIGH', 'MEDIUM', 'LOW']).optional(),
  origin: z.enum(['ASSISTED', 'MANUAL']).optional(),
  /** 'available' (default) hides confirmed-placed and explicitly unavailable candidates. */
  availability: z.enum(['available', 'all']).optional(),
  /** 'open' (default) hides closed / cancelled jobs. */
  jobs: z.enum(['open', 'all']).optional(),
});

export const ShortlistFiltersSchema = z.object({
  q: z.string().trim().max(100).optional(),
  requisitionId: uuid.optional(),
  presentation: z.enum(['not_presented', 'awaiting_feedback', 'feedback', 'all']).optional(),
  jobs: z.enum(['open', 'all']).optional(),
});

export type RunMatchingInput = z.input<typeof RunMatchingSchema>;
export type RemoveFromShortlistInput = z.input<typeof RemoveFromShortlistSchema>;
export type RecordPresentedInput = z.input<typeof RecordPresentedSchema>;
export type RecordFeedbackInput = z.input<typeof RecordFeedbackSchema>;
export type MatchFilters = z.input<typeof MatchFiltersSchema>;
export type ShortlistFilters = z.input<typeof ShortlistFiltersSchema>;

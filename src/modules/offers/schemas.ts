import { z } from 'zod';

const blankToUndef = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const optionalText = (max: number) =>
  z.preprocess(blankToUndef, z.string().trim().max(max).optional());
const optionalDate = z.preprocess(
  blankToUndef,
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date')
    .optional(),
);

export const OFFER_PERIODS = ['ANNUAL', 'MONTHLY', 'WEEKLY', 'HOURLY'] as const;

const Terms = {
  amount: z
    .string()
    .trim()
    .regex(/^\d{1,10}(\.\d{1,2})?$/, 'Enter an amount like 32000 or 15.50')
    .refine((v) => Number(v) > 0, 'Amount must be more than zero'),
  currencyCode: z.string().trim().length(3).toUpperCase(),
  period: z.enum(OFFER_PERIODS),
  /** Proposed start date (a proposal — the placement's start date is set on the placement). */
  startDate: optionalDate,
  /** Date by which the candidate should respond. */
  expiresOn: optionalDate,
  terms: optionalText(4000),
  notes: optionalText(4000),
};

export const CreateOfferSchema = z.object({ applicationId: z.string().uuid(), ...Terms });
export type CreateOfferInput = z.input<typeof CreateOfferSchema>;

export const UpdateOfferSchema = z.object({ offerId: z.string().uuid(), ...Terms });
export type UpdateOfferInput = z.input<typeof UpdateOfferSchema>;

export const OFFER_ACTIONS = [
  'SENT',
  'NEGOTIATING',
  'ACCEPTED',
  'REJECTED',
  'WITHDRAWN',
  'EXPIRED',
] as const;

export const TransitionOfferSchema = z
  .object({
    offerId: z.string().uuid(),
    to: z.enum(OFFER_ACTIONS),
    note: optionalText(1000),
  })
  .refine((d) => !(d.to === 'REJECTED' || d.to === 'WITHDRAWN') || (d.note?.length ?? 0) >= 3, {
    message: 'Give a reason (at least 3 characters)',
    path: ['note'],
  });
export type TransitionOfferInput = z.input<typeof TransitionOfferSchema>;

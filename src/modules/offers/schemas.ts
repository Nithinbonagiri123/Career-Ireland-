import { z } from 'zod';

const uuid = z.string().uuid();
const blank = z.literal('');

export const OfferStatusSchema = z.enum([
  'DRAFT',
  'SENT',
  'NEGOTIATING',
  'ACCEPTED',
  'REJECTED',
  'WITHDRAWN',
  'EXPIRED',
]);
export const OfferPeriodSchema = z.enum(['ANNUAL', 'MONTHLY', 'WEEKLY', 'HOURLY']);

export const CreateOfferSchema = z.object({
  jobApplicationId: uuid,
  amount: z.string().refine((v) => !Number.isNaN(Number(v)) && Number(v) > 0, 'Must be > 0'),
  currencyCode: z.string().length(3),
  period: OfferPeriodSchema.default('ANNUAL'),
  startDate: z.string().optional().or(blank),
  expiresOn: z.string().optional().or(blank),
  terms: z.string().max(4000).optional().or(blank),
  notes: z.string().max(2000).optional().or(blank),
});

export const UpdateOfferStatusSchema = z.object({
  id: uuid,
  status: OfferStatusSchema,
  notes: z.string().max(2000).optional().or(blank),
});

export const UpdateOfferSchema = z.object({
  id: uuid,
  amount: z.string().refine((v) => !Number.isNaN(Number(v)) && Number(v) > 0, 'Must be > 0'),
  currencyCode: z.string().length(3),
  period: OfferPeriodSchema,
  startDate: z.string().optional().or(blank),
  expiresOn: z.string().optional().or(blank),
  terms: z.string().max(4000).optional().or(blank),
  notes: z.string().max(2000).optional().or(blank),
});

export const RemoveOfferSchema = z.object({ id: uuid });

export type CreateOfferInput = z.infer<typeof CreateOfferSchema>;
export type UpdateOfferInput = z.infer<typeof UpdateOfferSchema>;
export type UpdateOfferStatusInput = z.infer<typeof UpdateOfferStatusSchema>;
export type RemoveOfferInput = z.infer<typeof RemoveOfferSchema>;

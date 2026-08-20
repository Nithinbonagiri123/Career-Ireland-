import { z } from 'zod';

export const PayerTypeSchema = z.enum(['PERSON', 'EMPLOYER', 'ANY']);

export const UpsertServiceItemSchema = z.object({
  id: z.string().uuid().optional(),
  code: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[A-Z0-9_]+$/, 'Uppercase letters, numbers, underscores only')
    .transform((s) => s.toUpperCase()),
  name: z.string().min(2).max(120),
  defaultCurrencyCode: z.string().length(3).optional().or(z.literal('')),
  defaultPrice: z.string().optional().or(z.literal('')),
  payerType: PayerTypeSchema,
  isActive: z.boolean(),
});

export const UpsertServicePackageSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2).max(120),
  serviceCatalogItemId: z.string().uuid(),
  price: z.string().refine((v) => !Number.isNaN(Number(v)), 'Must be a number'),
  currencyCode: z.string().length(3),
  isActive: z.boolean(),
});

export const SetActiveByIdSchema = z.object({
  id: z.string().uuid(),
  isActive: z.boolean(),
});

export type UpsertServiceItemInput = z.infer<typeof UpsertServiceItemSchema>;
export type UpsertServicePackageInput = z.infer<typeof UpsertServicePackageSchema>;
export type SetActiveByIdInput = z.infer<typeof SetActiveByIdSchema>;

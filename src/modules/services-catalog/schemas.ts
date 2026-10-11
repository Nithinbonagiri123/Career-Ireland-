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
  /**
   * Session 34 — optional business-line tag. Accepts the empty string
   * from the "— Uncategorised —" dropdown option so the dialog form
   * can bind directly without a client-side normaliser.
   */
  categoryId: z.string().uuid().optional().or(z.literal('')),
  isActive: z.boolean(),
});

/**
 * Session 34 — admin CRUD for business-line tags. Slug is lower-kebab-
 * case, auto-derived from name on insert if left blank by the client.
 */
export const UpsertServiceCategorySchema = z.object({
  id: z.string().uuid().optional(),
  slug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers, hyphens only')
    .optional()
    .or(z.literal('')),
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional().or(z.literal('')),
  displayOrder: z.number().int().min(0).max(10000).optional(),
  isActive: z.boolean(),
});

export const SetServiceCategoryActiveSchema = z.object({
  id: z.string().uuid(),
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
export type UpsertServiceCategoryInput = z.infer<typeof UpsertServiceCategorySchema>;
export type SetServiceCategoryActiveInput = z.infer<typeof SetServiceCategoryActiveSchema>;

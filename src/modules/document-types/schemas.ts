import { z } from 'zod';

export const AppliesToSchema = z.enum(['PERSON', 'EMPLOYER', 'BOTH']);

export const UpsertDocumentTypeSchema = z.object({
  id: z.string().uuid().optional(),
  code: z
    .string()
    .min(2, 'Code required')
    .max(60)
    .regex(/^[A-Z0-9_]+$/, 'Uppercase letters, numbers, underscores only')
    .transform((s) => s.toUpperCase()),
  name: z.string().min(2).max(120),
  hasExpiry: z.boolean(),
  appliesTo: AppliesToSchema,
  isActive: z.boolean(),
});

export const SetActiveByIdSchema = z.object({
  id: z.string().uuid(),
  isActive: z.boolean(),
});

export type UpsertDocumentTypeInput = z.infer<typeof UpsertDocumentTypeSchema>;
export type SetActiveByIdInput = z.infer<typeof SetActiveByIdSchema>;

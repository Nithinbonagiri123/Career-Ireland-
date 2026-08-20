import { z } from 'zod';

export const UpsertCategorySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2).max(120),
  isActive: z.boolean(),
});

export const UpsertOccupationSchema = z.object({
  id: z.string().uuid().optional(),
  categoryId: z.string().uuid(),
  name: z.string().min(2).max(120),
  isActive: z.boolean(),
});

export const SetActiveByIdSchema = z.object({
  id: z.string().uuid(),
  isActive: z.boolean(),
});

export type UpsertCategoryInput = z.infer<typeof UpsertCategorySchema>;
export type UpsertOccupationInput = z.infer<typeof UpsertOccupationSchema>;
export type SetActiveByIdInput = z.infer<typeof SetActiveByIdSchema>;

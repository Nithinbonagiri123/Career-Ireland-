import { z } from 'zod';

export const UpsertQualificationSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2).max(200),
  isActive: z.boolean(),
});

export const SetActiveByIdSchema = z.object({
  id: z.string().uuid(),
  isActive: z.boolean(),
});

export type UpsertQualificationInput = z.infer<typeof UpsertQualificationSchema>;
export type SetActiveByIdInput = z.infer<typeof SetActiveByIdSchema>;

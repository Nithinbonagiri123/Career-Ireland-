import { z } from 'zod';

export const UpsertSkillSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2).max(120),
  isActive: z.boolean(),
});

export const SetActiveByIdSchema = z.object({
  id: z.string().uuid(),
  isActive: z.boolean(),
});

export type UpsertSkillInput = z.infer<typeof UpsertSkillSchema>;
export type SetActiveByIdInput = z.infer<typeof SetActiveByIdSchema>;

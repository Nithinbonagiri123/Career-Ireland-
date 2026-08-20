import { z } from 'zod';

export const RoleSchema = z.enum(['ADMIN', 'STAFF']);

export const CreateUserSchema = z.object({
  email: z.string().email('Enter a valid email').max(200),
  fullName: z.string().min(2, 'Full name is required').max(200),
  role: RoleSchema,
  password: z.string().min(8, 'Minimum 8 characters').max(200),
});

export const ChangeRoleSchema = z.object({
  userId: z.string().uuid(),
  role: RoleSchema,
});

export const SetActiveSchema = z.object({
  userId: z.string().uuid(),
  isActive: z.boolean(),
});

export type CreateUserInput = z.infer<typeof CreateUserSchema>;
export type ChangeRoleInput = z.infer<typeof ChangeRoleSchema>;
export type SetActiveInput = z.infer<typeof SetActiveSchema>;

import { z } from 'zod';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '@/lib/auth/password-policy';

export const RoleSchema = z.enum(['ADMIN', 'STAFF']);

export const CreateUserSchema = z.object({
  email: z.string().email('Enter a valid email').max(200),
  fullName: z.string().min(2, 'Full name is required').max(200),
  role: RoleSchema,
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Minimum ${MIN_PASSWORD_LENGTH} characters`)
    .max(MAX_PASSWORD_LENGTH),
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

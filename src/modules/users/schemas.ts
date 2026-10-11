import { z } from 'zod';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '@/lib/auth/password-policy';

/**
 * Roles this UI is allowed to create or assign. Portal roles
 * (CANDIDATE / EMPLOYER) are provisioned via portal invitations, not
 * via the admin/users screen, so they're intentionally excluded here.
 */
export const RoleSchema = z.enum([
  'ADMIN',
  'STAFF',
  'MANAGER',
  'RECRUITER',
  'DOCUMENT_SPECIALIST',
  'FINANCE',
]);

export const CreateUserSchema = z.object({
  email: z.string().email('Enter a valid email').max(200),
  fullName: z.string().min(2, 'Full name is required').max(200),
  role: RoleSchema,
  /**
   * Session 33 — owner flag at creation time. Set true for co-founders
   * / partners who need record-reassignment powers and owner-bypass
   * access. Only the business owner can tick this box in the UI; the
   * server action also gates on requireOwner(). Required at the schema
   * level (not optional) so react-hook-form's resolver type stays
   * exact — the create-user form sets a default of false.
   */
  isOwner: z.boolean(),
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

/**
 * Session 33 — toggle the business-owner flag on an existing user.
 * Owner-only on the server; the "last owner cannot be demoted" rule is
 * enforced inside the service (not the schema) so the error is a
 * business-rule failure rather than a validation failure.
 */
export const SetOwnerSchema = z.object({
  userId: z.string().uuid(),
  isOwner: z.boolean(),
});

export type CreateUserInput = z.infer<typeof CreateUserSchema>;
export type ChangeRoleInput = z.infer<typeof ChangeRoleSchema>;
export type SetActiveInput = z.infer<typeof SetActiveSchema>;
export type SetOwnerInput = z.infer<typeof SetOwnerSchema>;

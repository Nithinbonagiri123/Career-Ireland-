import { z } from 'zod';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '@/lib/auth/password-policy';

export const LoginSchema = z.object({
  email: z.string().email('Enter a valid email').max(200),
  password: z.string().min(1, 'Password is required').max(MAX_PASSWORD_LENGTH),
});

export type LoginInput = z.infer<typeof LoginSchema>;

export const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required').max(MAX_PASSWORD_LENGTH),
    newPassword: z
      .string()
      .min(MIN_PASSWORD_LENGTH, `New password must be at least ${MIN_PASSWORD_LENGTH} characters`)
      .max(MAX_PASSWORD_LENGTH, 'New password is too long'),
    confirmPassword: z.string().min(1, 'Please confirm your new password').max(MAX_PASSWORD_LENGTH),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    path: ['newPassword'],
    message: 'New password must differ from current password',
  });

export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;

export const RequestPasswordResetSchema = z.object({
  email: z.string().email('Enter a valid email').max(200),
});

export type RequestPasswordResetInput = z.infer<typeof RequestPasswordResetSchema>;

export const CompletePasswordResetSchema = z
  .object({
    /**
     * URL-safe base64 encoding of 32 random bytes → 43 chars (no padding).
     * The token comes from the reset email link; treat it as user input.
     */
    token: z.string().min(20, 'Invalid reset link').max(200),
    newPassword: z
      .string()
      .min(MIN_PASSWORD_LENGTH, `New password must be at least ${MIN_PASSWORD_LENGTH} characters`)
      .max(MAX_PASSWORD_LENGTH, 'New password is too long'),
    confirmPassword: z.string().min(1, 'Please confirm your new password').max(MAX_PASSWORD_LENGTH),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

export type CompletePasswordResetInput = z.infer<typeof CompletePasswordResetSchema>;

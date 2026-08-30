import { z } from 'zod';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '@/lib/auth/password-policy';

export const InviteCandidateSchema = z.object({
  personId: z.string().uuid(),
  email: z.string().email().max(200),
  fullName: z.string().min(2).max(200),
});

export const InviteEmployerSchema = z.object({
  employerId: z.string().uuid(),
  email: z.string().email().max(200),
  fullName: z.string().min(2).max(200),
});

export const AcceptInvitationSchema = z.object({
  token: z.string().min(10).max(64),
  password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
    .max(MAX_PASSWORD_LENGTH),
});

export type InviteCandidateInput = z.infer<typeof InviteCandidateSchema>;
export type InviteEmployerInput = z.infer<typeof InviteEmployerSchema>;
export type AcceptInvitationInput = z.infer<typeof AcceptInvitationSchema>;

import { z } from 'zod';

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
  password: z.string().min(8).max(200),
});

export type InviteCandidateInput = z.infer<typeof InviteCandidateSchema>;
export type InviteEmployerInput = z.infer<typeof InviteEmployerSchema>;
export type AcceptInvitationInput = z.infer<typeof AcceptInvitationSchema>;

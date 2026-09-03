import { z } from 'zod';

export const RelationshipStatusSchema = z.enum(['PROSPECT', 'ACTIVE', 'ON_HOLD', 'ARCHIVED']);

export const UpsertEmployerSchema = z.object({
  id: z.string().uuid().optional(),
  legalName: z.string().min(2).max(200),
  tradingName: z.string().max(200).optional().or(z.literal('')),
  website: z.string().max(255).optional().or(z.literal('')),
  industry: z.string().max(120).optional().or(z.literal('')),
  country: z.string().max(80).optional().or(z.literal('')),
  city: z.string().max(120).optional().or(z.literal('')),
  relationshipStatus: RelationshipStatusSchema,
  assignedUserId: z.string().uuid().optional().or(z.literal('')),
  notes: z.string().max(2000).optional().or(z.literal('')),
});

export const UpsertContactSchema = z.object({
  id: z.string().uuid().optional(),
  employerId: z.string().uuid(),
  fullName: z.string().min(2).max(200),
  jobTitle: z.string().max(120).optional().or(z.literal('')),
  email: z.string().email().max(200).optional().or(z.literal('')),
  phone: z.string().max(30).optional().or(z.literal('')),
  isPrimary: z.boolean(),
});

export const ArchiveEmployerSchema = z.object({
  employerId: z.string().uuid(),
  reason: z.string().min(3).max(500),
});

export const UnarchiveEmployerSchema = z.object({
  employerId: z.string().uuid(),
  reason: z.string().min(3).max(500),
});

export type UpsertEmployerInput = z.infer<typeof UpsertEmployerSchema>;
export type UpsertContactInput = z.infer<typeof UpsertContactSchema>;
export type ArchiveEmployerInput = z.infer<typeof ArchiveEmployerSchema>;
export type UnarchiveEmployerInput = z.infer<typeof UnarchiveEmployerSchema>;

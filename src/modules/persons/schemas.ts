import { z } from 'zod';

export const PersonSourceSchema = z.enum([
  'DIRECT',
  'REFERRAL',
  'ADVERTISEMENT',
  'EMPLOYER_REFERRAL',
  'OTHER',
]);

export const CreatePersonSchema = z.object({
  firstName: z.string().min(1, 'First name required').max(100),
  lastName: z.string().min(1, 'Last name required').max(100),
  email: z.string().email().max(200).optional().or(z.literal('')),
  phone: z.string().max(30).optional().or(z.literal('')),
  dateOfBirth: z.string().date().optional().or(z.literal('')),
  nationality: z.string().max(80).optional().or(z.literal('')),
  currentCountry: z.string().max(80).optional().or(z.literal('')),
  currentCity: z.string().max(120).optional().or(z.literal('')),
  source: PersonSourceSchema,
  notes: z.string().max(2000).optional().or(z.literal('')),
});

/**
 * Edit an existing person. Same fields as create except `source` — that's a
 * one-shot classification of how the person entered the system, not something
 * to retroactively edit. Every other field is fair game (typos, phone
 * changes, moving city, etc.) with the same validation as create.
 */
export const UpdatePersonSchema = z.object({
  personId: z.string().uuid(),
  firstName: z.string().min(1, 'First name required').max(100),
  lastName: z.string().min(1, 'Last name required').max(100),
  email: z.string().email().max(200).optional().or(z.literal('')),
  phone: z.string().max(30).optional().or(z.literal('')),
  dateOfBirth: z.string().date().optional().or(z.literal('')),
  nationality: z.string().max(80).optional().or(z.literal('')),
  currentCountry: z.string().max(80).optional().or(z.literal('')),
  currentCity: z.string().max(120).optional().or(z.literal('')),
  notes: z.string().max(2000).optional().or(z.literal('')),
  /**
   * Optional candidate_profiles fields. Only applied when the person has an
   * active candidate profile — the service silently ignores them for leads/
   * prospects/unactivated persons so the same dialog can be shown to any
   * person without runtime errors.
   */
  primaryOccupationId: z.string().uuid().optional().or(z.literal('')),
  yearsOfExperience: z.string().max(60).optional().or(z.literal('')),
  workEligibility: z.string().max(200).optional().or(z.literal('')),
  preferredLocation: z.string().max(200).optional().or(z.literal('')),
  profileSummary: z.string().max(4000).optional().or(z.literal('')),
});

export const FindSimilarSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().optional(),
  phone: z.string().optional(),
});

export const MergePersonsSchema = z.object({
  loserPersonId: z.string().uuid(),
  survivorPersonId: z.string().uuid(),
  reason: z.string().min(3).max(500),
});

export const ArchivePersonSchema = z.object({
  personId: z.string().uuid(),
  reason: z.string().min(3).max(500),
});

export const UnarchivePersonSchema = z.object({
  personId: z.string().uuid(),
  reason: z.string().min(3).max(500),
});

export type CreatePersonInput = z.infer<typeof CreatePersonSchema>;
export type UpdatePersonInput = z.infer<typeof UpdatePersonSchema>;
export type FindSimilarInput = z.infer<typeof FindSimilarSchema>;
export type MergePersonsInput = z.infer<typeof MergePersonsSchema>;
export type ArchivePersonInput = z.infer<typeof ArchivePersonSchema>;
export type UnarchivePersonInput = z.infer<typeof UnarchivePersonSchema>;

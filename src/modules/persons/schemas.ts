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

export type CreatePersonInput = z.infer<typeof CreatePersonSchema>;
export type FindSimilarInput = z.infer<typeof FindSimilarSchema>;
export type MergePersonsInput = z.infer<typeof MergePersonsSchema>;

import { z } from 'zod';
import { UpsertEmployerSchema } from '@/modules/employers/schemas';
import { CreatePersonSchema } from '@/modules/persons/schemas';

export const LeadStatusSchema = z.enum([
  'NEW',
  'CONTACTED',
  'AWAITING_PAYMENT',
  'CONVERTED',
  'LOST',
  'REJECTED',
]);

export const LeadTargetBusinessSchema = z.enum([
  'CANDIDATE_SERVICES',
  'RECRUITMENT',
  'IMMIGRATION',
]);

/**
 * Four shapes for creating a Lead. Person-payer for Candidate Services and
 * Immigration (person can be existing or new); employer-payer for Recruitment
 * (employer can be existing or new). Discriminated union so the server never
 * has to guess which fields were provided.
 */
export const CreateLeadForExistingPersonSchema = z.object({
  mode: z.literal('EXISTING_PERSON'),
  targetBusiness: z.enum(['CANDIDATE_SERVICES', 'IMMIGRATION']),
  personId: z.string().uuid(),
  serviceOfInterestId: z.string().uuid().optional(),
  assignedUserId: z.string().uuid().optional(),
  notes: z.string().max(2000).optional().or(z.literal('')),
});

export const CreateLeadForNewPersonSchema = z.object({
  mode: z.literal('NEW_PERSON'),
  targetBusiness: z.enum(['CANDIDATE_SERVICES', 'IMMIGRATION']),
  person: CreatePersonSchema,
  serviceOfInterestId: z.string().uuid().optional(),
  assignedUserId: z.string().uuid().optional(),
  notes: z.string().max(2000).optional().or(z.literal('')),
});

export const CreateLeadForExistingEmployerSchema = z.object({
  mode: z.literal('EXISTING_EMPLOYER'),
  targetBusiness: z.literal('RECRUITMENT'),
  employerId: z.string().uuid(),
  serviceOfInterestId: z.string().uuid().optional(),
  assignedUserId: z.string().uuid().optional(),
  notes: z.string().max(2000).optional().or(z.literal('')),
});

export const CreateLeadForNewEmployerSchema = z.object({
  mode: z.literal('NEW_EMPLOYER'),
  targetBusiness: z.literal('RECRUITMENT'),
  employer: UpsertEmployerSchema.omit({ id: true }),
  serviceOfInterestId: z.string().uuid().optional(),
  assignedUserId: z.string().uuid().optional(),
  notes: z.string().max(2000).optional().or(z.literal('')),
});

export const CreateLeadSchema = z.discriminatedUnion('mode', [
  CreateLeadForExistingPersonSchema,
  CreateLeadForNewPersonSchema,
  CreateLeadForExistingEmployerSchema,
  CreateLeadForNewEmployerSchema,
]);

export const UpdateLeadStatusSchema = z.object({
  leadId: z.string().uuid(),
  status: z.enum(['NEW', 'CONTACTED', 'AWAITING_PAYMENT', 'LOST', 'REJECTED']),
  notes: z.string().max(500).optional().or(z.literal('')),
});

export const ConvertLeadSchema = z.object({
  leadId: z.string().uuid(),
  method: z.enum(['PAYMENT_VERIFIED', 'MANUAL_OVERRIDE']),
  reason: z.string().min(3).max(500),
  /** Optional link to the uploaded payment proof document instance. Captured in audit context. */
  paymentProofDocumentInstanceId: z.string().uuid().optional().or(z.literal('')),
});

export const ArchiveLeadSchema = z.object({
  leadId: z.string().uuid(),
  reason: z.string().min(3).max(500),
});

export const UnarchiveLeadSchema = z.object({
  leadId: z.string().uuid(),
  reason: z.string().min(3).max(500),
});

export type CreateLeadInput = z.infer<typeof CreateLeadSchema>;
export type UpdateLeadStatusInput = z.infer<typeof UpdateLeadStatusSchema>;
export type ConvertLeadInput = z.infer<typeof ConvertLeadSchema>;
export type ArchiveLeadInput = z.infer<typeof ArchiveLeadSchema>;
export type UnarchiveLeadInput = z.infer<typeof UnarchiveLeadSchema>;

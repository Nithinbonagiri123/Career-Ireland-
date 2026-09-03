import { z } from 'zod';
import { CreatePersonSchema } from '@/modules/persons/schemas';

export const LeadStatusSchema = z.enum([
  'NEW',
  'CONTACTED',
  'AWAITING_PAYMENT',
  'CONVERTED',
  'LOST',
  'REJECTED',
]);

/**
 * Two shapes for creating a Lead:
 *  - existingPerson: reuse an existing Person (typically after dedup match confirmation)
 *  - newPerson: create Person + Lead in one transaction
 */
export const CreateLeadForExistingPersonSchema = z.object({
  mode: z.literal('EXISTING_PERSON'),
  personId: z.string().uuid(),
  serviceOfInterestId: z.string().uuid().optional(),
  assignedUserId: z.string().uuid().optional(),
  notes: z.string().max(2000).optional().or(z.literal('')),
});

export const CreateLeadForNewPersonSchema = z.object({
  mode: z.literal('NEW_PERSON'),
  person: CreatePersonSchema,
  serviceOfInterestId: z.string().uuid().optional(),
  assignedUserId: z.string().uuid().optional(),
  notes: z.string().max(2000).optional().or(z.literal('')),
});

export const CreateLeadSchema = z.discriminatedUnion('mode', [
  CreateLeadForExistingPersonSchema,
  CreateLeadForNewPersonSchema,
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

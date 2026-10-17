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
  'EXPIRED',
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

export const CreateLeadForNewPersonSchema = z
  .object({
    mode: z.literal('NEW_PERSON'),
    targetBusiness: z.enum(['CANDIDATE_SERVICES', 'IMMIGRATION']),
    person: CreatePersonSchema,
    serviceOfInterestId: z.string().uuid().optional(),
    assignedUserId: z.string().uuid().optional(),
    notes: z.string().max(2000).optional().or(z.literal('')),
  })
  /**
   * Stage 1 — stricter validation for CS lead creation only. Immigration
   * keeps its looser schema so the Immigration intake flow doesn't break.
   * Marks email, phone, addressLine1, currentCountry, currentCity, and
   * primaryOccupationId as required when targetBusiness is CANDIDATE_SERVICES.
   * Field-level ctx.addIssue calls give the client per-field errors.
   */
  .superRefine((data, ctx) => {
    if (data.targetBusiness !== 'CANDIDATE_SERVICES') return;
    const req: Array<[keyof typeof data.person, string]> = [
      ['email', 'Email is required for Candidate Services leads'],
      ['phone', 'Phone is required for Candidate Services leads'],
      ['addressLine1', 'Address line 1 is required for Candidate Services leads'],
      ['currentCountry', 'Country is required for Candidate Services leads'],
      ['currentCity', 'City is required for Candidate Services leads'],
      ['primaryOccupationId', 'Primary profession is required for Candidate Services leads'],
    ];
    for (const [field, message] of req) {
      const v = data.person[field];
      if (!v || (typeof v === 'string' && v.trim().length === 0)) {
        ctx.addIssue({ code: 'custom', path: ['person', field], message });
      }
    }
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

export const AcceptLeadSchema = z.object({
  leadId: z.string().uuid(),
  /**
   * Free-text rationale ('payment cleared', 'client signed', 'manual
   * accept'). Audited.
   *
   * Stage 4 — relaxed to allow empty strings so an "ordinary"
   * pro-forma-triggered conversion (where a CONVERTED pro forma
   * already carries the money record) doesn't demand a reason the
   * operator has to invent. The service layer still requires `min(3)`
   * when the conversion is a manual override (no pro-forma-origin
   * invoice exists on the lead).
   */
  reason: z.string().max(500).optional().or(z.literal('')),
  // Payment-first conversion applies to all three business lines (CS,
  // Immigration, Recruitment). Accepting a lead atomically creates the
  // operational entity + engagement + payment + receipt in one tx —
  // no lead becomes a candidate/case/requisition without the money.
  // For Recruitment the engagement payer is the employer; for CS and
  // Immigration it's the person. Resolved from lead.targetBusiness in
  // the service.
  serviceCatalogItemId: z.string().uuid(),
  amount: z.string().refine((v) => !Number.isNaN(Number(v)) && Number(v) > 0, 'Must be > 0'),
  currencyCode: z.string().length(3),
  method: z.enum(['BANK_TRANSFER', 'CASH', 'OTHER']),
  proofReference: z.string().max(500).optional().or(z.literal('')),
  receivedAt: z.string().date().optional().or(z.literal('')),
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
export type AcceptLeadInput = z.infer<typeof AcceptLeadSchema>;
export type UpdateLeadStatusInput = z.infer<typeof UpdateLeadStatusSchema>;
export type ArchiveLeadInput = z.infer<typeof ArchiveLeadSchema>;
export type UnarchiveLeadInput = z.infer<typeof UnarchiveLeadSchema>;

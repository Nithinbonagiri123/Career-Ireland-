import { z } from 'zod';

export const CaseTypeSchema = z.enum(['EMPLOYMENT_PERMIT', 'VISA', 'VISA_EXTENSION']);
export const CaseStatusSchema = z.enum([
  'OPEN',
  'DOCUMENTS_PENDING',
  'SUBMITTED',
  'UNDER_AUTHORITY_REVIEW',
  'APPROVED',
  'REJECTED',
  'CLOSED',
]);

export const UpsertCaseSchema = z.object({
  id: z.string().uuid().optional(),
  caseType: CaseTypeSchema,
  beneficiaryPersonId: z.string().uuid(),
  sponsorEmployerId: z.string().uuid().optional().or(z.literal('')),
  relatedPlacementId: z.string().uuid().optional().or(z.literal('')),
  relatedJobRequisitionId: z.string().uuid().optional().or(z.literal('')),
  serviceEngagementId: z.string().uuid().optional().or(z.literal('')),
  status: CaseStatusSchema,
  authorityReference: z.string().max(120).optional().or(z.literal('')),
  submittedAt: z.string().date().optional().or(z.literal('')),
  decisionAt: z.string().date().optional().or(z.literal('')),
  expiresOn: z.string().date().optional().or(z.literal('')),
  notes: z.string().max(4000).optional().or(z.literal('')),
});

export const UpdateCaseStatusSchema = z.object({
  caseId: z.string().uuid(),
  status: CaseStatusSchema,
  authorityReference: z.string().max(120).optional().or(z.literal('')),
});

export type UpsertCaseInput = z.infer<typeof UpsertCaseSchema>;
export type UpdateCaseStatusInput = z.infer<typeof UpdateCaseStatusSchema>;

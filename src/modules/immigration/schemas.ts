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

// ─── Case documents ───────────────────────────────────────────────────────────

export const CaseDocumentStatusSchema = z.enum(['MISSING', 'PROVIDED', 'ACCEPTED', 'REJECTED']);
export const CaseDocumentMandatoryLevelSchema = z.enum(['MANDATORY', 'OPTIONAL']);

export const AddCaseDocumentRequirementSchema = z.object({
  immigrationCaseId: z.string().uuid(),
  documentTypeId: z.string().uuid(),
  isMandatory: CaseDocumentMandatoryLevelSchema.default('MANDATORY'),
  notes: z.string().max(500).optional().or(z.literal('')),
});

export const UpdateCaseDocumentRequirementSchema = z.object({
  requirementId: z.string().uuid(),
  status: CaseDocumentStatusSchema,
  notes: z.string().max(500).optional().or(z.literal('')),
});

export const RemoveCaseDocumentRequirementSchema = z.object({
  requirementId: z.string().uuid(),
});

export const AttachCaseDocumentSchema = z.object({
  immigrationCaseId: z.string().uuid(),
  documentInstanceId: z.string().uuid(),
  caseRequirementId: z.string().uuid().optional().or(z.literal('')),
});

export const DetachCaseDocumentSchema = z.object({
  immigrationCaseId: z.string().uuid(),
  documentInstanceId: z.string().uuid(),
});

export type UpsertCaseInput = z.infer<typeof UpsertCaseSchema>;
export type UpdateCaseStatusInput = z.infer<typeof UpdateCaseStatusSchema>;
export type AddCaseDocumentRequirementInput = z.infer<typeof AddCaseDocumentRequirementSchema>;
export type UpdateCaseDocumentRequirementInput = z.infer<
  typeof UpdateCaseDocumentRequirementSchema
>;
export type RemoveCaseDocumentRequirementInput = z.infer<
  typeof RemoveCaseDocumentRequirementSchema
>;
export type AttachCaseDocumentInput = z.infer<typeof AttachCaseDocumentSchema>;
export type DetachCaseDocumentInput = z.infer<typeof DetachCaseDocumentSchema>;

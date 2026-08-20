import { z } from 'zod';

export const OwnerTypeSchema = z.enum(['PERSON', 'EMPLOYER']);

export const PresignUploadSchema = z.object({
  ownerType: OwnerTypeSchema,
  ownerId: z.string().uuid(),
  documentTypeId: z.string().uuid(),
  originalFilename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(120),
  fileSizeBytes: z
    .number()
    .int()
    .positive()
    .max(50 * 1024 * 1024),
});

export const RegisterUploadSchema = z.object({
  ownerType: OwnerTypeSchema,
  ownerId: z.string().uuid(),
  documentTypeId: z.string().uuid(),
  s3ObjectKey: z.string().min(1).max(500),
  originalFilename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(120),
  fileSizeBytes: z.number().int().positive(),
  expiresOn: z.string().date().optional().or(z.literal('')),
  /** Optional: fulfil these requirement IDs on register. */
  fulfilRequirementIds: z.array(z.string().uuid()).optional(),
});

export const ReviewDocumentSchema = z.object({
  documentInstanceId: z.string().uuid(),
  decision: z.enum(['ACCEPTED', 'REJECTED']),
  reviewNotes: z.string().max(2000).optional().or(z.literal('')),
});

export const UpsertRequirementRuleSchema = z.object({
  id: z.string().uuid().optional(),
  documentTypeId: z.string().uuid(),
  scope: z.enum(['OCCUPATION', 'JOB_REQUISITION', 'SERVICE_PACKAGE', 'GLOBAL']),
  scopeRefId: z.string().uuid().optional().or(z.literal('')),
  notes: z.string().max(1000).optional().or(z.literal('')),
});

export const AddRequirementForPersonSchema = z.object({
  personId: z.string().uuid(),
  documentTypeId: z.string().uuid(),
  notes: z.string().max(500).optional().or(z.literal('')),
});

export const MaterializeRequirementsSchema = z.object({
  personId: z.string().uuid(),
});

export type PresignUploadInput = z.infer<typeof PresignUploadSchema>;
export type RegisterUploadInput = z.infer<typeof RegisterUploadSchema>;
export type ReviewDocumentInput = z.infer<typeof ReviewDocumentSchema>;
export type UpsertRequirementRuleInput = z.infer<typeof UpsertRequirementRuleSchema>;
export type AddRequirementForPersonInput = z.infer<typeof AddRequirementForPersonSchema>;
export type MaterializeRequirementsInput = z.infer<typeof MaterializeRequirementsSchema>;

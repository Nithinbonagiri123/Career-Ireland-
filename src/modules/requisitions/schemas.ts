import { z } from 'zod';

export const EmploymentTypeSchema = z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'TEMP']);
export const RequisitionStatusSchema = z.enum([
  'DRAFT',
  'OPEN',
  'IN_PROGRESS',
  'PARTIALLY_FILLED',
  'FILLED',
  'CLOSED',
  'CANCELLED',
]);

export const UpsertRequisitionSchema = z.object({
  id: z.string().uuid().optional(),
  employerId: z.string().uuid(),
  primaryContactId: z.string().uuid().optional().or(z.literal('')),
  title: z.string().min(2).max(200),
  occupationId: z.string().uuid().optional().or(z.literal('')),
  positionsRequired: z.number().int().min(1).max(999),
  location: z.string().max(200).optional().or(z.literal('')),
  employmentType: EmploymentTypeSchema,
  salaryMin: z.string().optional().or(z.literal('')),
  salaryMax: z.string().optional().or(z.literal('')),
  salaryCurrencyCode: z.string().length(3).optional().or(z.literal('')),
  description: z.string().max(4000).optional().or(z.literal('')),
  candidateRequirements: z.string().max(4000).optional().or(z.literal('')),
  status: RequisitionStatusSchema,
  assignedUserId: z.string().uuid().optional().or(z.literal('')),
  targetFillDate: z.string().date().optional().or(z.literal('')),
});

export const UpdateStatusSchema = z.object({
  requisitionId: z.string().uuid(),
  status: RequisitionStatusSchema,
});

// ─── Structured requirements ──────────────────────────────────────────────────

export const AttachRequisitionSkillSchema = z.object({
  jobRequisitionId: z.string().uuid(),
  skillId: z.string().uuid(),
  isRequired: z.boolean().default(true),
  weight: z.coerce.number().int().min(1).max(10).default(1),
});

export const DetachRequisitionSkillSchema = z.object({
  jobRequisitionId: z.string().uuid(),
  skillId: z.string().uuid(),
});

export const AttachRequisitionQualificationSchema = z.object({
  jobRequisitionId: z.string().uuid(),
  qualificationId: z.string().uuid(),
  isRequired: z.boolean().default(true),
});

export const DetachRequisitionQualificationSchema = z.object({
  jobRequisitionId: z.string().uuid(),
  qualificationId: z.string().uuid(),
});

// ─── Archive ──────────────────────────────────────────────────────────────────

export const ArchiveRequisitionSchema = z.object({
  requisitionId: z.string().uuid(),
  reason: z.string().min(3).max(500),
});

export const UnarchiveRequisitionSchema = z.object({
  requisitionId: z.string().uuid(),
  reason: z.string().min(3).max(500),
});

export type UpsertRequisitionInput = z.infer<typeof UpsertRequisitionSchema>;
export type UpdateStatusInput = z.infer<typeof UpdateStatusSchema>;
export type AttachRequisitionSkillInput = z.infer<typeof AttachRequisitionSkillSchema>;
export type DetachRequisitionSkillInput = z.infer<typeof DetachRequisitionSkillSchema>;
export type AttachRequisitionQualificationInput = z.infer<
  typeof AttachRequisitionQualificationSchema
>;
export type DetachRequisitionQualificationInput = z.infer<
  typeof DetachRequisitionQualificationSchema
>;
export type ArchiveRequisitionInput = z.infer<typeof ArchiveRequisitionSchema>;
export type UnarchiveRequisitionInput = z.infer<typeof UnarchiveRequisitionSchema>;

import { z } from 'zod';

const uuid = z.string().uuid();
const blank = z.literal('');

export const ProficiencySchema = z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT']);

// ─── Skills ───────────────────────────────────────────────────────────────────

export const AddCandidateSkillSchema = z
  .object({
    personId: uuid,
    /** Set when the operator picked a catalog match. Nullable for free text. */
    skillId: uuid.optional().or(blank),
    /** Set when the operator entered free text ("copy-paste from the CV"). */
    customName: z.string().min(1).max(200).optional().or(blank),
    proficiency: ProficiencySchema.default('INTERMEDIATE'),
    yearsExperience: z.coerce.number().int().min(0).max(80).optional().nullable(),
    notes: z.string().max(500).optional().or(blank),
  })
  .refine(
    (v) =>
      (typeof v.skillId === 'string' && v.skillId.length > 0) !==
      (typeof v.customName === 'string' && v.customName.length > 0),
    { message: 'Provide exactly one of skillId or customName', path: ['customName'] },
  );

export const UpdateCandidateSkillSchema = z.object({
  id: uuid,
  proficiency: ProficiencySchema,
  yearsExperience: z.coerce.number().int().min(0).max(80).optional().nullable(),
  notes: z.string().max(500).optional().or(blank),
});

export const RemoveCandidateSkillSchema = z.object({ id: uuid });

// ─── Qualifications ───────────────────────────────────────────────────────────

export const AddCandidateQualificationSchema = z
  .object({
    personId: uuid,
    /** Set when the operator picked a catalog match. Nullable for free text. */
    qualificationId: uuid.optional().or(blank),
    /** Set when the operator entered free text. */
    customName: z.string().min(1).max(200).optional().or(blank),
    awardedOn: z.string().optional().or(blank),
    institution: z.string().max(200).optional().or(blank),
    referenceNumber: z.string().max(120).optional().or(blank),
    notes: z.string().max(500).optional().or(blank),
  })
  .refine(
    (v) =>
      (typeof v.qualificationId === 'string' && v.qualificationId.length > 0) !==
      (typeof v.customName === 'string' && v.customName.length > 0),
    {
      message: 'Provide exactly one of qualificationId or customName',
      path: ['customName'],
    },
  );

export const UpdateCandidateQualificationSchema = z.object({
  id: uuid,
  awardedOn: z.string().optional().or(blank),
  institution: z.string().max(200).optional().or(blank),
  referenceNumber: z.string().max(120).optional().or(blank),
  notes: z.string().max(500).optional().or(blank),
});

export const RemoveCandidateQualificationSchema = z.object({ id: uuid });

// ─── Employment history ───────────────────────────────────────────────────────

export const UpsertEmploymentHistorySchema = z
  .object({
    id: uuid.optional(),
    personId: uuid,
    employerName: z.string().min(1).max(200),
    jobTitle: z.string().max(200).optional().or(blank),
    location: z.string().max(200).optional().or(blank),
    startDate: z.string().optional().or(blank),
    endDate: z.string().optional().or(blank),
    isCurrent: z.boolean().default(false),
    description: z.string().max(2000).optional().or(blank),
  })
  .refine((v) => !(v.isCurrent && v.endDate && v.endDate.length > 0), {
    message: 'A current job cannot have an end date',
    path: ['endDate'],
  });

export const RemoveEmploymentHistorySchema = z.object({ id: uuid });

export type AddCandidateSkillInput = z.infer<typeof AddCandidateSkillSchema>;
export type UpdateCandidateSkillInput = z.infer<typeof UpdateCandidateSkillSchema>;
export type RemoveCandidateSkillInput = z.infer<typeof RemoveCandidateSkillSchema>;
export type AddCandidateQualificationInput = z.infer<typeof AddCandidateQualificationSchema>;
export type UpdateCandidateQualificationInput = z.infer<typeof UpdateCandidateQualificationSchema>;
export type RemoveCandidateQualificationInput = z.infer<typeof RemoveCandidateQualificationSchema>;
export type UpsertEmploymentHistoryInput = z.infer<typeof UpsertEmploymentHistorySchema>;
export type RemoveEmploymentHistoryInput = z.infer<typeof RemoveEmploymentHistorySchema>;

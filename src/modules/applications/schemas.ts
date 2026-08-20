import { z } from 'zod';

export const ApplicationStatusSchema = z.enum([
  'APPLIED',
  'UNDER_REVIEW',
  'SHORTLISTED',
  'INTERVIEW',
  'OFFER',
  'ACCEPTED',
  'REJECTED',
  'WITHDRAWN',
]);

export const CreateApplicationSchema = z.object({
  jobRequisitionId: z.string().uuid(),
  personId: z.string().uuid(),
});

export const UpdateApplicationStatusSchema = z.object({
  applicationId: z.string().uuid(),
  status: ApplicationStatusSchema,
  rejectionReason: z.string().max(500).optional().or(z.literal('')),
});

export type CreateApplicationInput = z.infer<typeof CreateApplicationSchema>;
export type UpdateApplicationStatusInput = z.infer<typeof UpdateApplicationStatusSchema>;

import { z } from 'zod';

const blank = z.literal('');

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

export const ApplicationSourceSchema = z.enum([
  'INTERNAL',
  'IRISH_JOBS',
  'INDEED',
  'JOBS_IRELAND',
  'LINKEDIN',
  'COMPANY_WEBSITE',
  'REFERRAL',
  'OTHER',
]);

/** Internal application against a tracked employer requisition. */
export const CreateApplicationSchema = z.object({
  jobRequisitionId: z.string().uuid(),
  personId: z.string().uuid(),
  cvDocumentInstanceId: z.string().uuid().optional().or(blank),
  notes: z.string().max(1000).optional().or(blank),
});

/**
 * External application — candidate applied on IrishJobs / Indeed / etc.
 * No requisition; requires source and external company name.
 */
export const CreateExternalApplicationSchema = z.object({
  personId: z.string().uuid(),
  source: ApplicationSourceSchema.exclude(['INTERNAL']),
  externalCompanyName: z.string().trim().min(1).max(200),
  externalJobTitle: z.string().max(200).optional().or(blank),
  externalJobUrl: z.string().url().max(500).optional().or(blank),
  externalJobReference: z.string().max(200).optional().or(blank),
  cvDocumentInstanceId: z.string().uuid().optional().or(blank),
  appliedAt: z.string().optional().or(blank),
  notes: z.string().max(1000).optional().or(blank),
});

export const UpdateApplicationStatusSchema = z.object({
  applicationId: z.string().uuid(),
  status: ApplicationStatusSchema,
  rejectionReason: z.string().max(500).optional().or(blank),
});

export type CreateApplicationInput = z.infer<typeof CreateApplicationSchema>;
export type CreateExternalApplicationInput = z.infer<typeof CreateExternalApplicationSchema>;
export type UpdateApplicationStatusInput = z.infer<typeof UpdateApplicationStatusSchema>;

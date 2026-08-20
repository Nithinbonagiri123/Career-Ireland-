import { z } from 'zod';

export const CampaignStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED']);
export const AdStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'EXPIRED', 'CLOSED']);
export const ProspectStatusSchema = z.enum([
  'NEW',
  'SCREENED',
  'CONVERTED_TO_CANDIDATE',
  'RETAINED_IN_POOL',
  'NOT_SUITABLE',
]);

export const UpsertCampaignSchema = z.object({
  id: z.string().uuid().optional(),
  jobRequisitionId: z.string().uuid().optional().or(z.literal('')),
  name: z.string().min(2).max(200),
  status: CampaignStatusSchema,
  notes: z.string().max(2000).optional().or(z.literal('')),
});

export const UpsertAdSchema = z.object({
  id: z.string().uuid().optional(),
  campaignId: z.string().uuid(),
  country: z.string().min(2).max(80),
  platform: z.string().max(120).optional().or(z.literal('')),
  targetApplicants: z.number().int().min(1).max(9999),
  startDate: z.string().date(),
  expiryDate: z.string().date(),
  status: AdStatusSchema,
  notes: z.string().max(2000).optional().or(z.literal('')),
});

export const CreateProspectSchema = z.object({
  advertisementId: z.string().uuid(),
  personId: z.string().uuid(),
});

export const UpdateProspectStatusSchema = z.object({
  prospectId: z.string().uuid(),
  status: ProspectStatusSchema,
  notes: z.string().max(500).optional().or(z.literal('')),
});

export type UpsertCampaignInput = z.infer<typeof UpsertCampaignSchema>;
export type UpsertAdInput = z.infer<typeof UpsertAdSchema>;
export type CreateProspectInput = z.infer<typeof CreateProspectSchema>;
export type UpdateProspectStatusInput = z.infer<typeof UpdateProspectStatusSchema>;

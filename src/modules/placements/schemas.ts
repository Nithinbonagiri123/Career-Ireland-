import { z } from 'zod';

export const PlacementStatusSchema = z.enum([
  'PROPOSED',
  'CONFIRMED',
  'STARTED',
  'COMPLETED',
  'TERMINATED_EARLY',
]);

export const CreatePlacementSchema = z.object({
  personId: z.string().uuid(),
  employerId: z.string().uuid(),
  jobRequisitionId: z.string().uuid(),
  jobApplicationId: z.string().uuid().optional().or(z.literal('')),
  status: PlacementStatusSchema.default('PROPOSED'),
  offerDate: z.string().date().optional().or(z.literal('')),
  startDate: z.string().date().optional().or(z.literal('')),
  salary: z.string().optional().or(z.literal('')),
  salaryCurrencyCode: z.string().length(3).optional().or(z.literal('')),
  notes: z.string().max(2000).optional().or(z.literal('')),
});

export const UpdatePlacementStatusSchema = z.object({
  placementId: z.string().uuid(),
  status: PlacementStatusSchema,
  endDate: z.string().date().optional().or(z.literal('')),
});

export const RestoreAvailabilitySchema = z.object({
  personId: z.string().uuid(),
  reason: z.string().min(3).max(500),
});

export const ArchivePlacementSchema = z.object({
  placementId: z.string().uuid(),
  reason: z.string().min(3).max(500),
});

export const UnarchivePlacementSchema = z.object({
  placementId: z.string().uuid(),
  reason: z.string().min(3).max(500),
});

export type CreatePlacementInput = z.infer<typeof CreatePlacementSchema>;
export type UpdatePlacementStatusInput = z.infer<typeof UpdatePlacementStatusSchema>;
export type RestoreAvailabilityInput = z.infer<typeof RestoreAvailabilitySchema>;
export type ArchivePlacementInput = z.infer<typeof ArchivePlacementSchema>;
export type UnarchivePlacementInput = z.infer<typeof UnarchivePlacementSchema>;

import { z } from 'zod';

export const PlacementStatusSchema = z.enum([
  'PROPOSED',
  'CONFIRMED',
  'STARTED',
  'COMPLETED',
  'TERMINATED_EARLY',
]);

/**
 * Placing a candidate who has no offer accepted in the CRM (e.g. a hire
 * agreed through external recruitment) is allowed only as an explicit,
 * audited exception: the user must tick the confirmation and give a reason.
 */
export const PlacementOfferExceptionSchema = z.object({
  confirmed: z.literal(true, { error: 'Tick the confirmation to place without an accepted offer' }),
  reason: z
    .string()
    .trim()
    .min(5, 'Give a reason of at least 5 characters')
    .max(500, 'Keep the reason under 500 characters'),
});

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
  offerException: z.unknown().optional(),
});

export const UpdatePlacementStatusSchema = z.object({
  placementId: z.string().uuid(),
  status: PlacementStatusSchema,
  endDate: z.string().date().optional().or(z.literal('')),
  offerException: z.unknown().optional(),
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

export type PlacementOfferException = z.input<typeof PlacementOfferExceptionSchema>;
export type CreatePlacementInput = Omit<z.infer<typeof CreatePlacementSchema>, 'offerException'> & {
  offerException?: PlacementOfferException;
};
export type UpdatePlacementStatusInput = Omit<
  z.infer<typeof UpdatePlacementStatusSchema>,
  'offerException'
> & { offerException?: PlacementOfferException };
export type RestoreAvailabilityInput = z.infer<typeof RestoreAvailabilitySchema>;
export type ArchivePlacementInput = z.infer<typeof ArchivePlacementSchema>;
export type UnarchivePlacementInput = z.infer<typeof UnarchivePlacementSchema>;

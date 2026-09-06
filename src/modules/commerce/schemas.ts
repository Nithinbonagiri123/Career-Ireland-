import { z } from 'zod';

export const PayerModeSchema = z.enum(['PERSON', 'EMPLOYER']);

/** Create a Service Engagement. Payer is Person OR Employer (mutually exclusive). */
export const CreateEngagementSchema = z
  .object({
    serviceCatalogItemId: z.string().uuid(),
    servicePackageId: z.string().uuid().optional().or(z.literal('')),
    payerMode: PayerModeSchema,
    payerPersonId: z.string().uuid().optional().or(z.literal('')),
    payerEmployerId: z.string().uuid().optional().or(z.literal('')),
    beneficiaryPersonId: z.string().uuid().optional().or(z.literal('')),
    agreedAmount: z
      .string()
      .refine((v) => !Number.isNaN(Number(v)) && Number(v) > 0, 'Must be > 0'),
    currencyCode: z.string().length(3),
    notes: z.string().max(2000).optional().or(z.literal('')),
  })
  .refine(
    (v) => (v.payerMode === 'PERSON' ? Boolean(v.payerPersonId) : Boolean(v.payerEmployerId)),
    { message: 'Select a payer', path: ['payerPersonId'] },
  );

export const UpdateEngagementStatusSchema = z.object({
  engagementId: z.string().uuid(),
  status: z.enum(['REQUESTED', 'PENDING_PAYMENT', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED']),
  reason: z.string().max(500).optional().or(z.literal('')),
});

export const RecordPaymentSchema = z.object({
  serviceEngagementId: z.string().uuid(),
  amount: z.string().refine((v) => !Number.isNaN(Number(v)) && Number(v) > 0, 'Must be > 0'),
  currencyCode: z.string().length(3),
  method: z.enum(['BANK_TRANSFER', 'CASH', 'OTHER']),
  proofReference: z.string().max(500).optional().or(z.literal('')),
  receivedAt: z.string().date().optional().or(z.literal('')),
});

export const VerifyPaymentSchema = z.object({
  paymentId: z.string().uuid(),
});

export const RejectPaymentSchema = z.object({
  paymentId: z.string().uuid(),
  reason: z.string().min(3).max(500),
});

export const ArchiveEngagementSchema = z.object({
  engagementId: z.string().uuid(),
  reason: z.string().min(3).max(500),
});

export const UnarchiveEngagementSchema = z.object({
  engagementId: z.string().uuid(),
  reason: z.string().min(3).max(500),
});

export type CreateEngagementInput = z.infer<typeof CreateEngagementSchema>;
export type UpdateEngagementStatusInput = z.infer<typeof UpdateEngagementStatusSchema>;
export type RecordPaymentInput = z.infer<typeof RecordPaymentSchema>;
export type VerifyPaymentInput = z.infer<typeof VerifyPaymentSchema>;
export type RejectPaymentInput = z.infer<typeof RejectPaymentSchema>;
export type ArchiveEngagementInput = z.infer<typeof ArchiveEngagementSchema>;
export type UnarchiveEngagementInput = z.infer<typeof UnarchiveEngagementSchema>;

import { z } from 'zod';

/**
 * Pro-forma composer schemas. The server recomputes every total from
 * the raw (quantity × unit_price) inputs — any `lineSubtotal` /
 * `subtotal` field on the wire is accepted for display convenience
 * only and discarded by the writer. See `modules/proformas/service.ts`.
 */

const money2dp = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, 'Must be a decimal number with up to 2 places');
const qty3dp = z.string().regex(/^\d+(\.\d{1,3})?$/, 'Must be a positive quantity');

export const ProFormaLineInputSchema = z.object({
  serviceCatalogItemId: z.string().uuid(),
  description: z.string().min(1, 'Description required').max(500),
  quantity: qty3dp,
  unitPrice: money2dp,
});
export type ProFormaLineInput = z.infer<typeof ProFormaLineInputSchema>;

export const CreateProFormaSchema = z
  .object({
    sourceLeadId: z.string().uuid(),
    /** Group this pro forma together with sibling proposals on the
     *  same lead. Server fetches-or-creates the group. */
    proposalGroupId: z.string().uuid().nullish(),
    currencyCode: z.string().length(3),
    paymentTerms: z.string().max(500).optional().or(z.literal('')),
    notes: z.string().max(2000).optional().or(z.literal('')),
    lines: z.array(ProFormaLineInputSchema).min(1, 'At least one line is required'),
  })
  .refine((d) => d.lines.length <= 50, {
    message: 'Too many lines (max 50)',
    path: ['lines'],
  });
export type CreateProFormaInput = z.infer<typeof CreateProFormaSchema>;

export const EditDraftProFormaSchema = z.object({
  proFormaInvoiceId: z.string().uuid(),
  currencyCode: z.string().length(3),
  paymentTerms: z.string().max(500).optional().or(z.literal('')),
  notes: z.string().max(2000).optional().or(z.literal('')),
  lines: z.array(ProFormaLineInputSchema).min(1).max(50),
});
export type EditDraftProFormaInput = z.infer<typeof EditDraftProFormaSchema>;

export const IssueProFormaSchema = z.object({
  proFormaInvoiceId: z.string().uuid(),
});
export type IssueProFormaInput = z.infer<typeof IssueProFormaSchema>;

/** Revise an already-ISSUED pro forma. Snapshots the current state
 *  into pro_forma_revisions, writes the new content, bumps revision. */
export const ReviseIssuedProFormaSchema = z.object({
  proFormaInvoiceId: z.string().uuid(),
  reason: z.string().min(3, 'Please note what changed').max(500),
  currencyCode: z.string().length(3),
  paymentTerms: z.string().max(500).optional().or(z.literal('')),
  notes: z.string().max(2000).optional().or(z.literal('')),
  lines: z.array(ProFormaLineInputSchema).min(1).max(50),
});
export type ReviseIssuedProFormaInput = z.infer<typeof ReviseIssuedProFormaSchema>;

export const RecordAcceptanceSchema = z.object({
  proFormaInvoiceId: z.string().uuid(),
  /** Audit note — "client signed email reply", "verbal accept over phone",
   *  "selected tier B over tier A". Required so acceptance isn't opaque. */
  reason: z.string().min(3).max(500),
});
export type RecordAcceptanceInput = z.infer<typeof RecordAcceptanceSchema>;

export const RejectProFormaSchema = z.object({
  proFormaInvoiceId: z.string().uuid(),
  reason: z.string().min(3).max(500),
});
export type RejectProFormaInput = z.infer<typeof RejectProFormaSchema>;

export const CancelProFormaSchema = z.object({
  proFormaInvoiceId: z.string().uuid(),
  reason: z.string().min(3).max(500),
});
export type CancelProFormaInput = z.infer<typeof CancelProFormaSchema>;

export const RecordProFormaPaymentSchema = z.object({
  proFormaInvoiceId: z.string().uuid(),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Must be a positive money value'),
  currencyCode: z.string().length(3),
  method: z.enum(['BANK_TRANSFER', 'CASH', 'OTHER']),
  receivedAt: z.string().date().optional().or(z.literal('')),
  proofReference: z.string().max(500).optional().or(z.literal('')),
});
export type RecordProFormaPaymentInput = z.infer<typeof RecordProFormaPaymentSchema>;

export const VerifyProFormaPaymentSchema = z.object({
  paymentId: z.string().uuid(),
});
export type VerifyProFormaPaymentInput = z.infer<typeof VerifyProFormaPaymentSchema>;

export const IssuePreIssuanceRefundSchema = z.object({
  paymentId: z.string().uuid(),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  method: z.enum(['BANK_TRANSFER', 'CASH', 'OTHER']),
  reason: z.string().min(3).max(500),
  reference: z.string().max(500).optional().or(z.literal('')),
  idempotencyKey: z.string().min(1).max(100),
});
export type IssuePreIssuanceRefundInput = z.infer<typeof IssuePreIssuanceRefundSchema>;

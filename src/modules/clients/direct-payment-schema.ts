import { z } from 'zod';

/**
 * Stage 6E Section 3 — input schema for Direct Payment & Convert.
 *
 * Lives in its own module (not the `'use server'` file) because
 * Next.js server-action files are only allowed to export async
 * functions. The schema is imported by both the server action
 * (`direct-payment.ts`) and the vitest schema suite.
 */
export const DirectPaymentAndConvertSchema = z.object({
  leadId: z.string().uuid(),
  serviceCatalogItemId: z.string().uuid(),
  agreedAmount: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, 'Agreed amount must be a decimal with up to 2 decimal places'),
  paymentAmount: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, 'Payment amount must be a decimal with up to 2 decimal places'),
  currencyCode: z.string().length(3),
  /** Payment method. Stage 6G Screen 10 — `CARD` is now a first-class
   *  value on payments.method (text column, no DB constraint), so the
   *  dialog's Card tab records and prints "CARD" honestly instead of
   *  the Stage 6E-era silent mapping to OTHER. Card payments store only
   *  the operator-entered terminal / processor reference — never card
   *  data. Refund methods remain BANK_TRANSFER / CASH / OTHER. */
  methodDisplay: z.enum(['CASH', 'BANK_TRANSFER', 'CARD', 'OTHER']),
  /** YYYY-MM-DD in Europe/Dublin (the UI uses `todayInDublin()` for the
   *  prefill). Operator can backdate; we store this on the payment's
   *  `receivedAt`. */
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'paymentDate must be YYYY-MM-DD'),
  /** Optional transaction reference. If present, printed on invoice +
   *  receipt. If blank, both documents omit the field entirely. */
  reference: z.string().max(500).nullish(),
  /** UI-generated per dialog mount so a double-click can't duplicate. */
  idempotencyKey: z.string().min(8).max(128),
  /** Operator-confirmed override for the duplicate detector. Required
   *  when the detector finds a live invoice / accepted pro-forma for
   *  the same service. */
  overrideDuplicateReason: z.string().max(500).nullish(),
  /**
   * Stage 6G Screen 10 — the services this payment covers (step 2 of
   * the dialog). When present, the amounts must sum to `agreedAmount`,
   * `serviceCatalogItemId` must be the first entry, and the invoice
   * line names every selected service.
   */
  services: z
    .array(
      z.object({
        serviceCatalogItemId: z.string().uuid(),
        name: z.string().trim().min(1).max(200),
        amount: z
          .string()
          .regex(/^\d+(\.\d{1,2})?$/, 'Amount must be a decimal with up to 2 decimal places'),
      }),
    )
    .max(20)
    .optional(),
});

export type DirectPaymentAndConvertInput = z.infer<typeof DirectPaymentAndConvertSchema>;

export type DirectPaymentAndConvertResult = {
  invoiceId: string;
  invoiceNumber: string;
  receiptId: string;
  receiptNumber: string;
  paymentId: string;
  engagementId: string;
  candidateProfileId: string;
  personId: string;
  alreadyProcessed: boolean;
};

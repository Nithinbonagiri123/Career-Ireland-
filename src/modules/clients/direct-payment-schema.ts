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
  /** Payment method. Aligned with the pro-forma payments schema (3
   *  values: CASH / BANK_TRANSFER / OTHER). Stage 6E+1 — the earlier
   *  Stage 6E `'CARD'` display option was removed because it silently
   *  mapped to `'OTHER'` on the DB column and on receipts, so operators
   *  and clients saw "Other" where they expected "Card". For card
   *  payments pick "Other" and put the Stripe / terminal reference in
   *  the Payment reference field; the receipt will print the reference
   *  verbatim. A follow-up stage can widen the payments.method DB enum
   *  to include CARD once a cross-table migration is scoped. */
  methodDisplay: z.enum(['CASH', 'BANK_TRANSFER', 'OTHER']),
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

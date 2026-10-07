import { z } from 'zod';

/**
 * Pure zod schemas + small helpers for Accounts Payable. Lives in its
 * own module (no auth / db imports) so vitest can import and test the
 * validation logic without pulling the full service stack.
 */

export const CreateSupplierSchema = z.object({
  legalName: z.string().min(1).max(200),
  tradingName: z.string().max(200).optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().max(50).optional(),
  address: z.string().max(1000).optional(),
  taxNumber: z.string().max(50).optional(),
  country: z
    .string()
    .length(2)
    .regex(/^[A-Z]{2}$/)
    .optional(),
  currencyCode: z
    .string()
    .length(3)
    .regex(/^[A-Z]{3}$/)
    .optional(),
  paymentTermsDays: z.number().int().min(0).max(365).optional().default(30),
  notes: z.string().max(5000).optional(),
});
export type CreateSupplierInput = z.infer<typeof CreateSupplierSchema>;

export const UpdateSupplierSchema = CreateSupplierSchema.partial().extend({
  id: z.string().uuid(),
  isActive: z.boolean().optional(),
});
export type UpdateSupplierInput = z.infer<typeof UpdateSupplierSchema>;

export const CreateBillSchema = z.object({
  supplierId: z.string().uuid(),
  supplierReference: z.string().max(100).optional(),
  billDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  currencyCode: z
    .string()
    .length(3)
    .regex(/^[A-Z]{3}$/),
  subtotal: z.string().regex(/^\d+(\.\d{1,2})?$/, 'subtotal must be a decimal with up to 2 dp'),
  taxAmount: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, 'tax must be a decimal with up to 2 dp')
    .optional()
    .default('0'),
  expenseAccountCode: z.string().min(1).max(10),
  description: z.string().min(1).max(500),
});
export type CreateBillInput = z.infer<typeof CreateBillSchema>;

export const RecordBillPaymentSchema = z.object({
  billId: z.string().uuid(),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  method: z
    .enum(['BANK_TRANSFER', 'CARD', 'CASH', 'DIRECT_DEBIT', 'CHEQUE', 'OTHER'])
    .optional()
    .default('BANK_TRANSFER'),
  reference: z.string().max(200).optional(),
});
export type RecordBillPaymentInput = z.infer<typeof RecordBillPaymentSchema>;

/**
 * Compute `tax_amount` for a credit note by pro-rating the originating
 * invoice's tax across the credit amount. Pure — safe to unit-test.
 */
export function proRateCreditTax(args: {
  creditAmount: string;
  invoiceSubtotal: string;
  invoiceTax: string;
  invoiceTotal: string;
}): string {
  const totalCents = Math.round(Number.parseFloat(args.invoiceTotal) * 100);
  if (totalCents === 0) return '0.00';
  const taxCents = Math.round(Number.parseFloat(args.invoiceTax) * 100);
  const creditCents = Math.round(Number.parseFloat(args.creditAmount) * 100);
  const creditTaxCents = Math.round((creditCents * taxCents) / totalCents);
  return (creditTaxCents / 100).toFixed(2);
}

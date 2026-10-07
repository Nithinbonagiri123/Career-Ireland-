import { describe, expect, it } from 'vitest';
import {
  CreateBillSchema,
  CreateSupplierSchema,
  proRateCreditTax,
  RecordBillPaymentSchema,
} from './schemas';

describe('proRateCreditTax', () => {
  it('splits tax proportionally for a partial credit', () => {
    // Invoice: 1000 net + 230 tax = 1230 total. Credit 123 (10% of total).
    // Expected tax portion = 10% × 230 = 23.00
    expect(
      proRateCreditTax({
        creditAmount: '123.00',
        invoiceSubtotal: '1000.00',
        invoiceTax: '230.00',
        invoiceTotal: '1230.00',
      }),
    ).toBe('23.00');
  });

  it('returns the full tax when crediting the full invoice', () => {
    expect(
      proRateCreditTax({
        creditAmount: '1230.00',
        invoiceSubtotal: '1000.00',
        invoiceTax: '230.00',
        invoiceTotal: '1230.00',
      }),
    ).toBe('230.00');
  });

  it('returns 0 when the invoice carried no tax', () => {
    expect(
      proRateCreditTax({
        creditAmount: '50.00',
        invoiceSubtotal: '100.00',
        invoiceTax: '0.00',
        invoiceTotal: '100.00',
      }),
    ).toBe('0.00');
  });

  it('rounds half-up to the nearest cent', () => {
    // Invoice 100 + 23 = 123. Credit 50. 50/123 × 23 = 9.3496... rounds to 9.35
    expect(
      proRateCreditTax({
        creditAmount: '50.00',
        invoiceSubtotal: '100.00',
        invoiceTax: '23.00',
        invoiceTotal: '123.00',
      }),
    ).toBe('9.35');
  });

  it('handles zero-total invoices without dividing by zero', () => {
    expect(
      proRateCreditTax({
        creditAmount: '0.00',
        invoiceSubtotal: '0.00',
        invoiceTax: '0.00',
        invoiceTotal: '0.00',
      }),
    ).toBe('0.00');
  });
});

describe('CreateSupplierSchema', () => {
  it('accepts a minimal valid supplier', () => {
    const r = CreateSupplierSchema.safeParse({ legalName: 'Acme Ltd' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.paymentTermsDays).toBe(30); // default
  });

  it('rejects empty legal name', () => {
    const r = CreateSupplierSchema.safeParse({ legalName: '' });
    expect(r.success).toBe(false);
  });

  it('requires country to be exactly 2 uppercase letters when set', () => {
    expect(CreateSupplierSchema.safeParse({ legalName: 'X', country: 'IRE' }).success).toBe(false);
    expect(CreateSupplierSchema.safeParse({ legalName: 'X', country: 'ie' }).success).toBe(false);
    expect(CreateSupplierSchema.safeParse({ legalName: 'X', country: 'IE' }).success).toBe(true);
  });

  it('rejects negative payment terms', () => {
    expect(CreateSupplierSchema.safeParse({ legalName: 'X', paymentTermsDays: -5 }).success).toBe(
      false,
    );
  });

  it('accepts terms up to 365 days', () => {
    expect(CreateSupplierSchema.safeParse({ legalName: 'X', paymentTermsDays: 365 }).success).toBe(
      true,
    );
    expect(CreateSupplierSchema.safeParse({ legalName: 'X', paymentTermsDays: 366 }).success).toBe(
      false,
    );
  });
});

describe('CreateBillSchema', () => {
  // Use a v4-compliant UUID — zod 4's `.uuid()` enforces the version
  // byte (1-8 or the nil UUID).
  const valid = {
    supplierId: '11111111-1111-4111-8111-111111111111',
    billDate: '2026-01-15',
    dueDate: '2026-02-14',
    currencyCode: 'EUR',
    subtotal: '100.00',
    expenseAccountCode: '6300',
    description: 'Software subscription',
  };

  it('accepts a bill with zero tax', () => {
    const r = CreateBillSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.taxAmount).toBe('0');
  });

  it('rejects malformed subtotal', () => {
    expect(CreateBillSchema.safeParse({ ...valid, subtotal: '100,00' }).success).toBe(false);
    expect(CreateBillSchema.safeParse({ ...valid, subtotal: '-10.00' }).success).toBe(false);
  });

  it('rejects non-UUID supplier id', () => {
    expect(CreateBillSchema.safeParse({ ...valid, supplierId: 'not-a-uuid' }).success).toBe(false);
  });

  it('rejects malformed dates', () => {
    expect(CreateBillSchema.safeParse({ ...valid, billDate: '15-01-2026' }).success).toBe(false);
    expect(CreateBillSchema.safeParse({ ...valid, dueDate: '2026/02/14' }).success).toBe(false);
  });

  it('rejects currency that is not 3 uppercase letters', () => {
    expect(CreateBillSchema.safeParse({ ...valid, currencyCode: 'eur' }).success).toBe(false);
    expect(CreateBillSchema.safeParse({ ...valid, currencyCode: 'EURR' }).success).toBe(false);
  });

  it('accepts optional supplier reference', () => {
    const r = CreateBillSchema.safeParse({ ...valid, supplierReference: 'INV-2026-003' });
    expect(r.success).toBe(true);
  });
});

describe('RecordBillPaymentSchema', () => {
  const valid = {
    billId: '22222222-2222-4222-8222-222222222222',
    paymentDate: '2026-01-20',
    amount: '100.00',
  };

  it('defaults method to BANK_TRANSFER', () => {
    const r = RecordBillPaymentSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.method).toBe('BANK_TRANSFER');
  });

  it('rejects an unknown payment method', () => {
    expect(RecordBillPaymentSchema.safeParse({ ...valid, method: 'BITCOIN' }).success).toBe(false);
  });

  it('rejects a non-decimal amount', () => {
    expect(RecordBillPaymentSchema.safeParse({ ...valid, amount: 'abc' }).success).toBe(false);
    expect(RecordBillPaymentSchema.safeParse({ ...valid, amount: '12.345' }).success).toBe(false);
  });
});

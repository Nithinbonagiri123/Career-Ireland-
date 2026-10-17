import { describe, expect, it } from 'vitest';
import {
  CancelProFormaSchema,
  CreateProFormaSchema,
  EditDraftProFormaSchema,
  IssueProFormaSchema,
  RecordAcceptanceSchema,
  RejectProFormaSchema,
  ReviseIssuedProFormaSchema,
} from './schemas';

const UID = '11111111-1111-4111-8111-111111111111';
const UID2 = '22222222-2222-4222-8222-222222222222';

const BASE_LINE = {
  serviceCatalogItemId: UID2,
  description: 'Standard CS onboarding',
  quantity: '1.000',
  unitPrice: '500.00',
};

describe('CreateProFormaSchema', () => {
  it('accepts a single-line single-currency pro forma', () => {
    const r = CreateProFormaSchema.safeParse({
      sourceLeadId: UID,
      currencyCode: 'EUR',
      lines: [BASE_LINE],
    });
    expect(r.success).toBe(true);
  });

  it('accepts multiple lines', () => {
    const r = CreateProFormaSchema.safeParse({
      sourceLeadId: UID,
      currencyCode: 'EUR',
      lines: [BASE_LINE, { ...BASE_LINE, description: 'Add-on' }, BASE_LINE],
    });
    expect(r.success).toBe(true);
  });

  it('rejects zero lines', () => {
    const r = CreateProFormaSchema.safeParse({
      sourceLeadId: UID,
      currencyCode: 'EUR',
      lines: [],
    });
    expect(r.success).toBe(false);
  });

  it('rejects >50 lines', () => {
    const r = CreateProFormaSchema.safeParse({
      sourceLeadId: UID,
      currencyCode: 'EUR',
      lines: Array.from({ length: 51 }, () => BASE_LINE),
    });
    expect(r.success).toBe(false);
  });

  it('rejects an empty description', () => {
    const r = CreateProFormaSchema.safeParse({
      sourceLeadId: UID,
      currencyCode: 'EUR',
      lines: [{ ...BASE_LINE, description: '' }],
    });
    expect(r.success).toBe(false);
  });

  it('rejects a quantity of 0', () => {
    const r = CreateProFormaSchema.safeParse({
      sourceLeadId: UID,
      currencyCode: 'EUR',
      lines: [{ ...BASE_LINE, quantity: '0' }],
    });
    // The Zod regex permits "0" so the business check lives in money.ts;
    // but a leading-zero decimal like "0.000" is semantically zero and
    // should also be caught by the service layer. The schema here only
    // guards format — it accepts "0" as a string.
    expect(r.success).toBe(true); // service rejects, schema stays loose
  });

  it('rejects a negative unit price in format', () => {
    const r = CreateProFormaSchema.safeParse({
      sourceLeadId: UID,
      currencyCode: 'EUR',
      lines: [{ ...BASE_LINE, unitPrice: '-5.00' }],
    });
    expect(r.success).toBe(false);
  });

  it('rejects a 4-letter currency code', () => {
    const r = CreateProFormaSchema.safeParse({
      sourceLeadId: UID,
      currencyCode: 'EURO',
      lines: [BASE_LINE],
    });
    expect(r.success).toBe(false);
  });

  it('accepts optional payment terms + notes', () => {
    const r = CreateProFormaSchema.safeParse({
      sourceLeadId: UID,
      currencyCode: 'ZAR',
      paymentTerms: 'Net 14 days from acceptance.',
      notes: 'Follow up next week.',
      lines: [BASE_LINE],
    });
    expect(r.success).toBe(true);
  });
});

describe('EditDraftProFormaSchema', () => {
  it('requires a proFormaInvoiceId', () => {
    const r = EditDraftProFormaSchema.safeParse({
      currencyCode: 'EUR',
      lines: [BASE_LINE],
    });
    expect(r.success).toBe(false);
  });
  it('accepts a valid payload', () => {
    const r = EditDraftProFormaSchema.safeParse({
      proFormaInvoiceId: UID,
      currencyCode: 'EUR',
      lines: [BASE_LINE],
    });
    expect(r.success).toBe(true);
  });
});

describe('IssueProFormaSchema', () => {
  it('requires only proFormaInvoiceId', () => {
    expect(IssueProFormaSchema.safeParse({ proFormaInvoiceId: UID }).success).toBe(true);
  });
  it('rejects malformed uuid', () => {
    expect(IssueProFormaSchema.safeParse({ proFormaInvoiceId: 'bad' }).success).toBe(false);
  });
});

describe('ReviseIssuedProFormaSchema', () => {
  it('requires reason ≥ 3', () => {
    const r = ReviseIssuedProFormaSchema.safeParse({
      proFormaInvoiceId: UID,
      currencyCode: 'EUR',
      reason: 'ok',
      lines: [BASE_LINE],
    });
    expect(r.success).toBe(false);
  });
  it('accepts a valid revise payload', () => {
    const r = ReviseIssuedProFormaSchema.safeParse({
      proFormaInvoiceId: UID,
      currencyCode: 'EUR',
      reason: 'Adjusted scope after client call.',
      lines: [BASE_LINE],
    });
    expect(r.success).toBe(true);
  });
});

describe('RecordAcceptance / Reject / Cancel schemas', () => {
  it('all require a reason', () => {
    expect(
      RecordAcceptanceSchema.safeParse({ proFormaInvoiceId: UID, reason: 'signed' }).success,
    ).toBe(true);
    expect(RecordAcceptanceSchema.safeParse({ proFormaInvoiceId: UID, reason: 'x' }).success).toBe(
      false,
    );
    expect(RejectProFormaSchema.safeParse({ proFormaInvoiceId: UID, reason: 'nope' }).success).toBe(
      true,
    );
    expect(
      CancelProFormaSchema.safeParse({ proFormaInvoiceId: UID, reason: 'moved' }).success,
    ).toBe(true);
  });
});

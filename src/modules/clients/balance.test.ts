import { describe, expect, it } from 'vitest';
import { buildClientBalance } from './balance';

const EUR = 'EUR';
const USD = 'USD';
const E1 = 'e1';
const E2 = 'e2';
const P1 = 'p1';
const P2 = 'p2';
const PF1 = 'pf1';
const LID = 'lead-1';

describe('buildClientBalance — single engagement, single currency', () => {
  it('no payments → fully outstanding', () => {
    const r = buildClientBalance({
      engagements: [
        {
          id: E1,
          serviceName: 'CV',
          currencyCode: EUR,
          agreedAmount: '100.00',
          status: 'PENDING_PAYMENT',
        },
      ],
      payments: [],
      refunds: [],
      invoices: [],
      proFormas: [],
    });
    expect(r.engagements[0]).toMatchObject({
      agreedAmount: '100.00',
      verifiedPaid: '0.00',
      outstanding: '100.00',
    });
    expect(r.byCurrency).toEqual([
      { currencyCode: EUR, agreed: '100.00', verified: '0.00', outstanding: '100.00' },
    ]);
  });

  it('verified payment covers agreed → fully paid', () => {
    const r = buildClientBalance({
      engagements: [
        { id: E1, serviceName: 'CV', currencyCode: EUR, agreedAmount: '100.00', status: 'ACTIVE' },
      ],
      payments: [
        {
          id: P1,
          serviceEngagementId: E1,
          amount: '100.00',
          currencyCode: EUR,
          status: 'VERIFIED',
        },
      ],
      refunds: [],
      invoices: [],
      proFormas: [],
    });
    expect(r.engagements[0]).toMatchObject({ verifiedPaid: '100.00', outstanding: '0.00' });
  });

  it('REJECTED payment never counts toward paid', () => {
    const r = buildClientBalance({
      engagements: [
        {
          id: E1,
          serviceName: 'CV',
          currencyCode: EUR,
          agreedAmount: '100.00',
          status: 'PENDING_PAYMENT',
        },
      ],
      payments: [
        {
          id: P1,
          serviceEngagementId: E1,
          amount: '100.00',
          currencyCode: EUR,
          status: 'REJECTED',
        },
      ],
      refunds: [],
      invoices: [],
      proFormas: [],
    });
    expect(r.engagements[0].verifiedPaid).toBe('0.00');
    expect(r.engagements[0].outstanding).toBe('100.00');
  });

  it('refund reduces net paid, bumps outstanding back up', () => {
    const r = buildClientBalance({
      engagements: [
        { id: E1, serviceName: 'CV', currencyCode: EUR, agreedAmount: '100.00', status: 'ACTIVE' },
      ],
      payments: [
        {
          id: P1,
          serviceEngagementId: E1,
          amount: '100.00',
          currencyCode: EUR,
          status: 'PARTIALLY_REFUNDED',
        },
      ],
      refunds: [{ paymentId: P1, amount: '40.00' }],
      invoices: [],
      proFormas: [],
    });
    expect(r.engagements[0].verifiedPaid).toBe('60.00');
    expect(r.engagements[0].outstanding).toBe('40.00');
  });

  it('cross-currency payment is ignored (never contributes to a mismatched engagement)', () => {
    const r = buildClientBalance({
      engagements: [
        {
          id: E1,
          serviceName: 'CV',
          currencyCode: EUR,
          agreedAmount: '100.00',
          status: 'PENDING_PAYMENT',
        },
      ],
      payments: [
        {
          id: P1,
          serviceEngagementId: E1,
          amount: '100.00',
          currencyCode: USD,
          status: 'VERIFIED',
        },
      ],
      refunds: [],
      invoices: [],
      proFormas: [],
    });
    expect(r.engagements[0].verifiedPaid).toBe('0.00');
  });
});

describe('buildClientBalance — multiple currencies never sum', () => {
  it('EUR + USD engagements produce two currency rollups, never combined', () => {
    const r = buildClientBalance({
      engagements: [
        { id: E1, serviceName: 'CV', currencyCode: EUR, agreedAmount: '100.00', status: 'ACTIVE' },
        {
          id: E2,
          serviceName: 'Interview coaching',
          currencyCode: USD,
          agreedAmount: '500.00',
          status: 'ACTIVE',
        },
      ],
      payments: [
        {
          id: P1,
          serviceEngagementId: E1,
          amount: '100.00',
          currencyCode: EUR,
          status: 'VERIFIED',
        },
        {
          id: P2,
          serviceEngagementId: E2,
          amount: '200.00',
          currencyCode: USD,
          status: 'VERIFIED',
        },
      ],
      refunds: [],
      invoices: [],
      proFormas: [],
    });
    expect(r.byCurrency).toHaveLength(2);
    expect(r.byCurrency.find((c) => c.currencyCode === EUR)).toMatchObject({
      agreed: '100.00',
      verified: '100.00',
      outstanding: '0.00',
    });
    expect(r.byCurrency.find((c) => c.currencyCode === USD)).toMatchObject({
      agreed: '500.00',
      verified: '200.00',
      outstanding: '300.00',
    });
  });
});

describe('buildClientBalance — pending accepted quotes (no engagement yet)', () => {
  it('ACCEPTED pro-forma with no engagementId becomes a pendingQuotes row + contributes to currency rollup', () => {
    const r = buildClientBalance({
      engagements: [],
      payments: [],
      refunds: [],
      invoices: [],
      proFormas: [
        {
          id: PF1,
          number: 'PROF-2026-000001',
          status: 'ACCEPTED',
          currencyCode: EUR,
          subtotal: '250.00',
          sourceLeadId: LID,
          engagementId: null,
        },
      ],
    });
    expect(r.pendingQuotes).toHaveLength(1);
    expect(r.pendingQuotes[0]).toMatchObject({
      proFormaNumber: 'PROF-2026-000001',
      currencyCode: EUR,
      agreedAmount: '250.00',
    });
    expect(r.byCurrency[0]).toMatchObject({
      currencyCode: EUR,
      agreed: '250.00',
      verified: '0.00',
      outstanding: '250.00',
    });
  });

  it('CONVERTED pro-forma does NOT appear in pendingQuotes — the engagement/invoice carries it', () => {
    const r = buildClientBalance({
      engagements: [
        { id: E1, serviceName: 'CV', currencyCode: EUR, agreedAmount: '100.00', status: 'ACTIVE' },
      ],
      payments: [
        {
          id: P1,
          serviceEngagementId: E1,
          amount: '100.00',
          currencyCode: EUR,
          status: 'VERIFIED',
        },
      ],
      refunds: [],
      invoices: [{ number: 'INV-2026-000001', serviceEngagementId: E1, status: 'PAID' }],
      proFormas: [
        {
          id: PF1,
          number: 'PROF-2026-000001',
          status: 'CONVERTED',
          currencyCode: EUR,
          subtotal: '100.00',
          sourceLeadId: LID,
          engagementId: E1,
        },
      ],
    });
    expect(r.pendingQuotes).toHaveLength(0);
    // The engagement row reflects the invoice/payment pair; it does NOT
    // double-count the pro-forma's subtotal.
    expect(r.engagements[0]).toMatchObject({
      agreedAmount: '100.00',
      verifiedPaid: '100.00',
      outstanding: '0.00',
      linkedInvoiceNumbers: ['INV-2026-000001'],
      linkedProFormaNumbers: ['PROF-2026-000001'],
    });
    expect(r.byCurrency[0].agreed).toBe('100.00');
  });

  // Stage B Wave 1 (client P0) — the doubled-amount regression. Recording
  // a payment against an ACCEPTED quote auto-creates the engagement while
  // the quote's engagementId stays NULL until conversion. The quote must
  // NOT be counted as a pending quote on top of the engagement.
  it('ACCEPTED quote with a recorded payment (engagement exists, engagementId still null) is counted ONCE', () => {
    const r = buildClientBalance({
      engagements: [
        {
          id: E1,
          serviceName: 'Job Search Support',
          currencyCode: EUR,
          agreedAmount: '500.00',
          status: 'PENDING_PAYMENT',
        },
      ],
      payments: [
        {
          id: P1,
          serviceEngagementId: E1,
          proFormaInvoiceId: PF1,
          amount: '200.00',
          currencyCode: EUR,
          status: 'VERIFIED',
        },
      ],
      refunds: [],
      invoices: [],
      proFormas: [
        {
          id: PF1,
          number: 'PROF-2026-000002',
          status: 'ACCEPTED',
          currencyCode: EUR,
          subtotal: '500.00',
          sourceLeadId: LID,
          engagementId: null, // linked only at conversion — the bug's trigger
        },
      ],
    });
    expect(r.pendingQuotes).toHaveLength(0);
    expect(r.engagements[0]).toMatchObject({
      agreedAmount: '500.00',
      verifiedPaid: '200.00',
      outstanding: '300.00',
    });
    // Before the fix this read agreed 1000.00 / outstanding 800.00.
    expect(r.byCurrency[0]).toMatchObject({
      currencyCode: EUR,
      agreed: '500.00',
      verified: '200.00',
      outstanding: '300.00',
    });
  });

  it('even a merely RECORDED (PENDING) payment bridges the quote to its engagement', () => {
    const r = buildClientBalance({
      engagements: [
        {
          id: E1,
          serviceName: 'Job Search Support',
          currencyCode: EUR,
          agreedAmount: '500.00',
          status: 'PENDING_PAYMENT',
        },
      ],
      payments: [
        {
          id: P1,
          serviceEngagementId: E1,
          proFormaInvoiceId: PF1,
          amount: '200.00',
          currencyCode: EUR,
          status: 'PENDING', // not yet verified — engagement already exists
        },
      ],
      refunds: [],
      invoices: [],
      proFormas: [
        {
          id: PF1,
          number: 'PROF-2026-000002',
          status: 'ACCEPTED',
          currencyCode: EUR,
          subtotal: '500.00',
          sourceLeadId: LID,
          engagementId: null,
        },
      ],
    });
    expect(r.pendingQuotes).toHaveLength(0);
    expect(r.byCurrency[0]).toMatchObject({ agreed: '500.00', verified: '0.00' });
  });

  it("a payment on a DIFFERENT quote does not bridge this quote's pending row", () => {
    const r = buildClientBalance({
      engagements: [
        { id: E1, serviceName: 'CV', currencyCode: EUR, agreedAmount: '100.00', status: 'ACTIVE' },
      ],
      payments: [
        {
          id: P1,
          serviceEngagementId: E1,
          proFormaInvoiceId: 'pf-other',
          amount: '100.00',
          currencyCode: EUR,
          status: 'VERIFIED',
        },
      ],
      refunds: [],
      invoices: [],
      proFormas: [
        {
          id: PF1,
          number: 'PROF-2026-000003',
          status: 'ACCEPTED',
          currencyCode: EUR,
          subtotal: '250.00',
          sourceLeadId: LID,
          engagementId: null,
        },
      ],
    });
    // The untouched accepted quote still shows as a pending commitment.
    expect(r.pendingQuotes).toHaveLength(1);
    expect(r.byCurrency[0]).toMatchObject({ agreed: '350.00' });
  });

  it('DRAFT / ISSUED / REJECTED / SUPERSEDED pro-formas never contribute to balances', () => {
    for (const status of ['DRAFT', 'ISSUED', 'REJECTED', 'CANCELLED', 'SUPERSEDED'] as const) {
      const r = buildClientBalance({
        engagements: [],
        payments: [],
        refunds: [],
        invoices: [],
        proFormas: [
          {
            id: PF1,
            number: 'PROF-X',
            status,
            currencyCode: EUR,
            subtotal: '999.00',
            sourceLeadId: LID,
            engagementId: null,
          },
        ],
      });
      expect(r.pendingQuotes).toHaveLength(0);
      expect(r.byCurrency).toHaveLength(0);
    }
  });
});

describe('buildClientBalance — VOIDED invoices', () => {
  it('a VOIDED invoice does not appear in the engagement linked list', () => {
    const r = buildClientBalance({
      engagements: [
        { id: E1, serviceName: 'CV', currencyCode: EUR, agreedAmount: '100.00', status: 'ACTIVE' },
      ],
      payments: [],
      refunds: [],
      invoices: [
        { number: 'INV-GOOD', serviceEngagementId: E1, status: 'PAID' },
        { number: 'INV-VOIDED', serviceEngagementId: E1, status: 'VOIDED' },
      ],
      proFormas: [],
    });
    expect(r.engagements[0].linkedInvoiceNumbers).toEqual(['INV-GOOD']);
  });
});

import { describe, expect, it } from 'vitest';
import { todayInDublin } from '@/lib/dates';
import { assertTransition, LEAD_TRANSITIONS } from '@/lib/state-machine';
import {
  closedLeadMessage,
  type InvoiceLinkFacts,
  invoiceLinkRefusal,
  isAmbiguousForNewCharge,
  payerModeForTarget,
  resolveReceivedDate,
  servicesForTarget,
} from './conversion-rules';

const LEAD = { id: 'lead-1', employerId: 'emp-1', createdAt: new Date('2026-10-01T09:00:00Z') };

function inv(over: Partial<InvoiceLinkFacts> = {}): InvoiceLinkFacts {
  return {
    id: 'inv-1',
    number: 'INV-2026-000001',
    payerEmployerId: 'emp-1',
    status: 'PAID',
    settlementKind: 'STANDARD',
    sourceLeadId: null,
    jobRequisitionId: null,
    placementId: null,
    immigrationCaseId: null,
    issuedAt: new Date('2026-10-02T10:00:00Z'),
    totalCents: 150000,
    verifiedPaidCents: 150000,
    unverifiedPaymentCount: 0,
    refundedPaymentCount: 0,
    creditNoteCount: 0,
    ...over,
  };
}

describe('payer for a lead conversion', () => {
  it('Recruitment is employer-paid, everything else person-paid', () => {
    expect(payerModeForTarget('RECRUITMENT')).toBe('EMPLOYER');
    expect(payerModeForTarget('IMMIGRATION')).toBe('PERSON');
    expect(payerModeForTarget('CANDIDATE_SERVICES')).toBe('PERSON');
  });
  it('the convert dialog offers EMPLOYER/ANY services for Recruitment, PERSON/ANY otherwise', () => {
    const svcs = [
      { id: 'a', payerType: 'PERSON' as const },
      { id: 'b', payerType: 'EMPLOYER' as const },
      { id: 'c', payerType: 'ANY' as const },
    ];
    expect(servicesForTarget('RECRUITMENT', svcs).map((s) => s.id)).toEqual(['b', 'c']);
    expect(servicesForTarget('IMMIGRATION', svcs).map((s) => s.id)).toEqual(['a', 'c']);
  });
});

describe('invoiceLinkRefusal', () => {
  it('accepts a fully paid, verified, unlinked invoice of the same employer', () => {
    expect(invoiceLinkRefusal(inv(), LEAD)).toBeNull();
    expect(invoiceLinkRefusal(inv({ sourceLeadId: 'lead-1' }), LEAD)).toBeNull();
  });
  it.each([
    [{ payerEmployerId: 'emp-2' }, 'LEAD_INVOICE_WRONG_PAYER'],
    [{ status: 'VOIDED' as const }, 'LEAD_INVOICE_VOIDED'],
    [{ settlementKind: 'COMPLIMENTARY' as const }, 'LEAD_INVOICE_COMPLIMENTARY'],
    [{ creditNoteCount: 1 }, 'LEAD_INVOICE_CREDITED'],
    [{ refundedPaymentCount: 1 }, 'LEAD_INVOICE_CREDITED'],
    [{ sourceLeadId: 'lead-2' }, 'LEAD_INVOICE_LINKED_ELSEWHERE'],
    [{ jobRequisitionId: 'req-9' }, 'LEAD_INVOICE_LINKED_ELSEWHERE'],
    [{ placementId: 'pl-9' }, 'LEAD_INVOICE_LINKED_ELSEWHERE'],
    [{ status: 'ISSUED' as const, verifiedPaidCents: 0 }, 'LEAD_INVOICE_NOT_VERIFIED'],
    [{ status: 'PARTIALLY_PAID' as const, verifiedPaidCents: 50000 }, 'LEAD_INVOICE_NOT_VERIFIED'],
    [{ unverifiedPaymentCount: 1 }, 'LEAD_INVOICE_NOT_VERIFIED'],
    [{ verifiedPaidCents: 149999 }, 'LEAD_INVOICE_NOT_VERIFIED'],
  ])('refuses %o with %s', (over, code) => {
    expect(invoiceLinkRefusal(inv(over), LEAD)?.code).toBe(code);
  });
  it('names the invoice in the finance-verification message', () => {
    expect(invoiceLinkRefusal(inv({ status: 'ISSUED', verifiedPaidCents: 0 }), LEAD)?.message).toBe(
      'Finance must verify the payment on INV-2026-000001 before this enquiry can be converted.',
    );
  });
});

describe('isAmbiguousForNewCharge', () => {
  it('a PAID unlinked invoice issued after the enquiry blocks a new charge', () => {
    expect(isAmbiguousForNewCharge(inv(), LEAD)).toBe(true);
  });
  it('a PAID unlinked invoice issued before the enquiry does not', () => {
    expect(isAmbiguousForNewCharge(inv({ issuedAt: new Date('2026-09-01T00:00:00Z') }), LEAD)).toBe(
      false,
    );
  });
  it('an open unlinked invoice blocks whenever it was issued', () => {
    expect(
      isAmbiguousForNewCharge(
        inv({ status: 'ISSUED', issuedAt: new Date('2025-01-01T00:00:00Z') }),
        LEAD,
      ),
    ).toBe(true);
  });
  it("the lead's own PAID invoice blocks; its open invoice is paid through conversion", () => {
    expect(isAmbiguousForNewCharge(inv({ sourceLeadId: 'lead-1' }), LEAD)).toBe(true);
    expect(isAmbiguousForNewCharge(inv({ sourceLeadId: 'lead-1', status: 'ISSUED' }), LEAD)).toBe(
      false,
    );
  });
  it('invoices for other work, other employers, void or complimentary never block', () => {
    expect(isAmbiguousForNewCharge(inv({ jobRequisitionId: 'r' }), LEAD)).toBe(false);
    expect(isAmbiguousForNewCharge(inv({ placementId: 'p' }), LEAD)).toBe(false);
    expect(isAmbiguousForNewCharge(inv({ sourceLeadId: 'lead-2' }), LEAD)).toBe(false);
    expect(isAmbiguousForNewCharge(inv({ payerEmployerId: 'emp-2' }), LEAD)).toBe(false);
    expect(isAmbiguousForNewCharge(inv({ status: 'VOIDED' }), LEAD)).toBe(false);
    expect(isAmbiguousForNewCharge(inv({ settlementKind: 'COMPLIMENTARY' }), LEAD)).toBe(false);
  });
});

describe('closed leads', () => {
  it('LOST / REJECTED / EXPIRED explain how to reopen; active statuses are fine', () => {
    expect(closedLeadMessage('EXPIRED')).toMatch(/Reactivate/);
    expect(closedLeadMessage('LOST')).toMatch(/Mark it contacted/);
    expect(closedLeadMessage('REJECTED')).toMatch(/Mark it contacted/);
    expect(closedLeadMessage('NEW')).toBeNull();
    expect(closedLeadMessage('AWAITING_PAYMENT')).toBeNull();
  });
});

describe('LEAD_TRANSITIONS — EXPIRED', () => {
  it('an expired lead can be closed out as lost / rejected from the status menu', () => {
    expect(() => assertTransition('lead', 'EXPIRED', 'LOST', LEAD_TRANSITIONS)).not.toThrow();
    expect(() => assertTransition('lead', 'EXPIRED', 'REJECTED', LEAD_TRANSITIONS)).not.toThrow();
  });
  it('reopening stays on the audited Reactivate action', () => {
    expect(() => assertTransition('lead', 'EXPIRED', 'CONTACTED', LEAD_TRANSITIONS)).toThrow();
    expect(() => assertTransition('lead', 'EXPIRED', 'NEW', LEAD_TRANSITIONS)).toThrow();
  });
});

describe('received dates use the Dublin business date', () => {
  it('todayInDublin follows Europe/Dublin across DST and year end', () => {
    // 29 Mar 2026 00:30 UTC = 00:30 GMT (DST starts at 01:00 UTC).
    expect(todayInDublin(new Date('2026-03-29T00:30:00Z'))).toBe('2026-03-29');
    // 28 Mar 2026 23:30 UTC is still the 28th in Dublin (GMT).
    expect(todayInDublin(new Date('2026-03-28T23:30:00Z'))).toBe('2026-03-28');
    // Summer: 23:30 UTC on 30 Jun is 00:30 IST on 1 Jul.
    expect(todayInDublin(new Date('2026-06-30T23:30:00Z'))).toBe('2026-07-01');
    // New year's eve 23:30 UTC = 23:30 GMT, still 31 Dec.
    expect(todayInDublin(new Date('2026-12-31T23:30:00Z'))).toBe('2026-12-31');
  });
  it('blank → today; future → refused; past → kept', () => {
    expect(resolveReceivedDate('', '2026-10-31')).toEqual({ ok: true, date: '2026-10-31' });
    expect(resolveReceivedDate(undefined, '2026-10-31')).toEqual({ ok: true, date: '2026-10-31' });
    expect(resolveReceivedDate('2026-10-30', '2026-10-31')).toEqual({
      ok: true,
      date: '2026-10-30',
    });
    expect(resolveReceivedDate('2026-11-01', '2026-10-31').ok).toBe(false);
  });
});

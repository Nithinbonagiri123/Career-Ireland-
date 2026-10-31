/**
 * Recruitment P0 — pure rules for converting a lead without charging the
 * payer twice. No I/O, so the server (acceptLead), the convert dialog and
 * the unit tests all use the same definitions.
 *
 * Two conversion modes exist for a Recruitment (employer-paid) lead:
 *   - EXISTING_INVOICE: the employer already has an invoice for this work,
 *     fully paid with finance-verified money. Conversion links that invoice
 *     to the lead and the new requisition and creates no new money rows.
 *   - NEW_PAYMENT: the operator records the payment at conversion (the
 *     original payment-first flow). Refused while the employer has an
 *     invoice that could be the same money (see `isAmbiguousForNewCharge`),
 *     unless finance confirms it really is a separate charge.
 */

export type LeadTargetBusiness = 'CANDIDATE_SERVICES' | 'RECRUITMENT' | 'IMMIGRATION';
export type LeadStatusValue =
  | 'NEW'
  | 'CONTACTED'
  | 'AWAITING_PAYMENT'
  | 'CONVERTED'
  | 'LOST'
  | 'REJECTED'
  | 'EXPIRED';

/** Who pays for a lead's conversion charge. One definition shared by the
 *  convert dialog (which service list to show) and the server check. */
export function payerModeForTarget(targetBusiness: LeadTargetBusiness): 'PERSON' | 'EMPLOYER' {
  return targetBusiness === 'RECRUITMENT' ? 'EMPLOYER' : 'PERSON';
}

/** Services the convert dialog may offer for a lead's payer. */
export function servicesForTarget<T extends { payerType: 'PERSON' | 'EMPLOYER' | 'ANY' }>(
  targetBusiness: LeadTargetBusiness,
  services: readonly T[],
): T[] {
  const payer = payerModeForTarget(targetBusiness);
  return services.filter((s) => s.payerType === 'ANY' || s.payerType === payer);
}

/** Statuses a lead must not be converted from. A closed lead is reopened
 *  first (status menu, or Reactivate for EXPIRED) so the decision is
 *  visible in its history. */
export const CLOSED_LEAD_STATUSES: ReadonlySet<LeadStatusValue> = new Set([
  'LOST',
  'REJECTED',
  'EXPIRED',
]);

export function closedLeadMessage(status: LeadStatusValue): string | null {
  if (status === 'EXPIRED') {
    return 'This lead has expired. Reactivate it before converting.';
  }
  if (status === 'LOST' || status === 'REJECTED') {
    return `This lead is marked ${status.toLowerCase()}. Mark it contacted again before converting.`;
  }
  return null;
}

/** What the server knows about one invoice when deciding whether it may be
 *  linked to a lead. Money values are integer cents. */
export type InvoiceLinkFacts = {
  id: string;
  number: string;
  payerEmployerId: string | null;
  status: 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'VOIDED';
  settlementKind: 'STANDARD' | 'COMPLIMENTARY';
  sourceLeadId: string | null;
  jobRequisitionId: string | null;
  placementId: string | null;
  immigrationCaseId: string | null;
  issuedAt: Date;
  totalCents: number;
  /** Sum of VERIFIED payments on the invoice's engagement. */
  verifiedPaidCents: number;
  /** Payments still waiting for finance (PENDING / PROOF_UPLOADED). */
  unverifiedPaymentCount: number;
  /** Payments partly or fully refunded. */
  refundedPaymentCount: number;
  creditNoteCount: number;
};

export type LinkRefusal = { code: string; message: string };

/**
 * Why `invoice` may NOT be used to convert `lead`, or null when it may.
 * The money must be unambiguous: the right employer, not void / free /
 * credited / refunded, not already serving another lead, requisition,
 * placement or case, and fully paid with finance-verified payments only.
 */
export function invoiceLinkRefusal(
  invoice: InvoiceLinkFacts,
  lead: { id: string; employerId: string | null },
): LinkRefusal | null {
  const n = invoice.number;
  if (!lead.employerId || invoice.payerEmployerId !== lead.employerId) {
    return {
      code: 'LEAD_INVOICE_WRONG_PAYER',
      message: `${n} was not issued to this lead's employer.`,
    };
  }
  if (invoice.status === 'VOIDED') {
    return { code: 'LEAD_INVOICE_VOIDED', message: `${n} has been voided.` };
  }
  if (invoice.settlementKind === 'COMPLIMENTARY') {
    return {
      code: 'LEAD_INVOICE_COMPLIMENTARY',
      message: `${n} is a complimentary (€0) invoice — no payment was received on it.`,
    };
  }
  if (invoice.creditNoteCount > 0 || invoice.refundedPaymentCount > 0) {
    return {
      code: 'LEAD_INVOICE_CREDITED',
      message: `${n} has a credit note or refund against it. Finance must confirm what is still paid before it can be used.`,
    };
  }
  if (invoice.sourceLeadId && invoice.sourceLeadId !== lead.id) {
    return {
      code: 'LEAD_INVOICE_LINKED_ELSEWHERE',
      message: `${n} already belongs to another enquiry.`,
    };
  }
  if (invoice.jobRequisitionId || invoice.placementId || invoice.immigrationCaseId) {
    return {
      code: 'LEAD_INVOICE_LINKED_ELSEWHERE',
      message: `${n} is already linked to another job, placement or case.`,
    };
  }
  if (
    invoice.status !== 'PAID' ||
    invoice.unverifiedPaymentCount > 0 ||
    invoice.verifiedPaidCents < invoice.totalCents
  ) {
    return {
      code: 'LEAD_INVOICE_NOT_VERIFIED',
      message: `Finance must verify the payment on ${n} before this enquiry can be converted.`,
    };
  }
  return null;
}

/**
 * Could this employer invoice be the same money as a payment someone is
 * about to record at conversion? Used to refuse the NEW_PAYMENT path.
 *
 * Ambiguous when the invoice is live money (ISSUED / PARTIALLY_PAID / PAID,
 * not complimentary) for this employer and EITHER
 *   - it was raised on this lead and is already PAID (the lead's money is
 *     in — recording more would charge twice), OR
 *   - it is not tied to any lead, job, placement or case, and
 *       · it is still open (ISSUED / PARTIALLY_PAID): the employer is being
 *         asked for that money now, so a payment arriving at conversion may
 *         well be the payment of that invoice, whenever it was raised; or
 *       · it is PAID and was issued on or after the lead was created: that
 *         is the double-charge from the audit (fee raised and paid from the
 *         employer page while the enquiry was open).
 * PAID unlinked invoices issued before the enquiry existed are treated as
 * earlier, separate business and do not block.
 * Invoices tied to another job / placement / case are clearly for that
 * work and never block.
 */
export function isAmbiguousForNewCharge(
  invoice: Pick<
    InvoiceLinkFacts,
    | 'payerEmployerId'
    | 'status'
    | 'settlementKind'
    | 'sourceLeadId'
    | 'jobRequisitionId'
    | 'placementId'
    | 'immigrationCaseId'
    | 'issuedAt'
  >,
  lead: { id: string; employerId: string | null; createdAt: Date },
): boolean {
  if (!lead.employerId || invoice.payerEmployerId !== lead.employerId) return false;
  if (invoice.status === 'VOIDED' || invoice.settlementKind === 'COMPLIMENTARY') return false;
  if (invoice.sourceLeadId === lead.id) return invoice.status === 'PAID';
  if (invoice.sourceLeadId) return false;
  if (invoice.jobRequisitionId || invoice.placementId || invoice.immigrationCaseId) return false;
  if (invoice.status === 'ISSUED' || invoice.status === 'PARTIALLY_PAID') return true;
  return invoice.issuedAt.getTime() >= lead.createdAt.getTime();
}

/** Payment received dates are business dates (Europe/Dublin). A date after
 *  today is refused; a blank date means today. */
export function resolveReceivedDate(
  input: string | null | undefined,
  today: string,
): { ok: true; date: string } | { ok: false; message: string } {
  const v = (input ?? '').trim();
  if (!v) return { ok: true, date: today };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return { ok: false, message: 'Invalid received date.' };
  if (v > today) {
    return { ok: false, message: 'The received date cannot be in the future.' };
  }
  return { ok: true, date: v };
}

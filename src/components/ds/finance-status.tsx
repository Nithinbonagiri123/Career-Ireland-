import { DsStatusPill, enumLabel } from './status-pill';
import type { DsTone } from './tones';

/**
 * Finance status labels + tones, one map per record kind. Every pill shows
 * text as well as colour. Values mirror the CHECK / enum lists in
 * src/lib/db/schema (commerce, billing, proformas, accounting, ap) — the
 * unit test fails if one is missing.
 */

type StatusDef = { label: string; tone: DsTone };

export const PAYMENT_STATUSES = [
  'PENDING',
  'PROOF_UPLOADED',
  'VERIFIED',
  'REJECTED',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
] as const;
export const INVOICE_STATUSES = ['ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOIDED'] as const;
export const PRO_FORMA_STATUSES = [
  'DRAFT',
  'ISSUED',
  'ACCEPTED',
  'REJECTED',
  'CANCELLED',
  'CONVERTED',
  'SUPERSEDED',
] as const;
export const JOURNAL_STATUSES = [
  'DRAFT',
  'PENDING_APPROVAL',
  'POSTED',
  'REVERSED',
  'VOID',
] as const;
export const PERIOD_STATUSES = ['OPEN', 'SOFT_CLOSED', 'CLOSED', 'LOCKED'] as const;
export const BILL_STATUSES = ['DRAFT', 'POSTED', 'PARTIALLY_PAID', 'PAID', 'VOID'] as const;
export const EVENT_STATUSES = [
  'RECEIVED',
  'PROCESSING',
  'PROCESSED',
  'FAILED',
  'MANUAL_REVIEW',
] as const;

export type FinanceStatusKind =
  | 'payment'
  | 'invoice'
  | 'proForma'
  | 'journal'
  | 'period'
  | 'bill'
  | 'event';

export const FINANCE_STATUS: Record<FinanceStatusKind, Record<string, StatusDef>> = {
  // Payment labels match the Payments workspace (VERIFIED reads "Paid").
  payment: {
    PENDING: { label: 'Pending', tone: 'blue' },
    PROOF_UPLOADED: { label: 'Pending', tone: 'blue' },
    VERIFIED: { label: 'Paid', tone: 'green' },
    REJECTED: { label: 'Rejected', tone: 'rose' },
    PARTIALLY_REFUNDED: { label: 'Partially refunded', tone: 'amber' },
    REFUNDED: { label: 'Refunded', tone: 'amber' },
  },
  invoice: {
    ISSUED: { label: 'Issued', tone: 'blue' },
    PARTIALLY_PAID: { label: 'Partially paid', tone: 'amber' },
    PAID: { label: 'Paid', tone: 'green' },
    VOIDED: { label: 'Voided', tone: 'rose' },
  },
  proForma: {
    DRAFT: { label: 'Draft', tone: 'slate' },
    ISSUED: { label: 'Issued', tone: 'blue' },
    ACCEPTED: { label: 'Accepted', tone: 'green' },
    REJECTED: { label: 'Rejected', tone: 'rose' },
    CANCELLED: { label: 'Cancelled', tone: 'slate' },
    CONVERTED: { label: 'Converted', tone: 'green' },
    SUPERSEDED: { label: 'Superseded', tone: 'slate' },
  },
  journal: {
    DRAFT: { label: 'Draft', tone: 'slate' },
    PENDING_APPROVAL: { label: 'Pending approval', tone: 'amber' },
    POSTED: { label: 'Posted', tone: 'green' },
    REVERSED: { label: 'Reversed', tone: 'violet' },
    VOID: { label: 'Void', tone: 'rose' },
  },
  period: {
    OPEN: { label: 'Open', tone: 'green' },
    SOFT_CLOSED: { label: 'Soft closed', tone: 'amber' },
    CLOSED: { label: 'Closed', tone: 'slate' },
    LOCKED: { label: 'Locked', tone: 'violet' },
  },
  bill: {
    DRAFT: { label: 'Draft', tone: 'slate' },
    POSTED: { label: 'Posted', tone: 'blue' },
    PARTIALLY_PAID: { label: 'Partially paid', tone: 'amber' },
    PAID: { label: 'Paid', tone: 'green' },
    VOID: { label: 'Void', tone: 'rose' },
  },
  event: {
    RECEIVED: { label: 'Received', tone: 'blue' },
    PROCESSING: { label: 'Processing', tone: 'blue' },
    PROCESSED: { label: 'Processed', tone: 'green' },
    FAILED: { label: 'Failed', tone: 'rose' },
    MANUAL_REVIEW: { label: 'Manual review', tone: 'amber' },
  },
};

/** Label + tone for a status; unknown values fall back to a readable label, slate. */
export function financeStatus(kind: FinanceStatusKind, status: string): StatusDef {
  return FINANCE_STATUS[kind][status] ?? { label: enumLabel(status), tone: 'slate' };
}

export function FinanceStatusPill({
  kind,
  status,
  className,
}: {
  kind: FinanceStatusKind;
  status: string;
  className?: string;
}) {
  const s = financeStatus(kind, status);
  return (
    <DsStatusPill tone={s.tone} className={className}>
      {s.label}
    </DsStatusPill>
  );
}

/**
 * Per-engagement balance summaries for the Client Workspace.
 *
 * Rules — approved in Stage 6A decision #5:
 *   - Never sum across currencies.
 *   - Never double-count a pro-forma and its originating invoice. When a
 *     pro-forma is CONVERTED, the money has materialised as the invoice;
 *     the engagement row shows the invoice's agreed/paid/outstanding, not
 *     the pro-forma's. ACCEPTED-but-not-yet-converted pro-formas contribute
 *     their own open commitment as a `pendingQuotes` row instead.
 *   - A client can hold multiple accepted pro-formas across multiple
 *     currencies simultaneously; each is a separate engagement row.
 */
export type EngagementBalance = {
  engagementId: string;
  serviceName: string;
  currencyCode: string;
  agreedAmount: string;
  verifiedPaid: string;
  outstanding: string;
  status: 'REQUESTED' | 'PENDING_PAYMENT' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED';
  linkedInvoiceNumbers: string[];
  linkedProFormaNumbers: string[];
};

/** A pending commitment: client accepted a quote but the engagement/payment
 *  row hasn't materialised yet. Rendered as its own card so the operator
 *  sees the accepted-but-unpaid obligation without having to open the
 *  quote. */
export type PendingQuoteBalance = {
  proFormaId: string;
  proFormaNumber: string;
  currencyCode: string;
  agreedAmount: string;
  sourceLeadId: string;
};

/** Per-currency rollup for the hero chips in the workspace header. */
export type CurrencyRollup = {
  currencyCode: string;
  agreed: string;
  verified: string;
  outstanding: string;
};

type EngagementInput = {
  id: string;
  serviceName: string;
  currencyCode: string;
  agreedAmount: string;
  status: EngagementBalance['status'];
};

type PaymentInput = {
  id: string;
  serviceEngagementId: string;
  amount: string;
  currencyCode: string;
  status:
    | 'PENDING'
    | 'PROOF_UPLOADED'
    | 'VERIFIED'
    | 'REJECTED'
    | 'PARTIALLY_REFUNDED'
    | 'REFUNDED';
};

type RefundInput = {
  /** Which payment this refund reduces. The payment's engagement is used
   *  to attribute the refund to the correct row. */
  paymentId: string;
  amount: string;
};

type InvoiceInput = {
  number: string;
  serviceEngagementId: string;
  status: 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'VOIDED';
};

type ProFormaInput = {
  id: string;
  number: string;
  status: 'DRAFT' | 'ISSUED' | 'ACCEPTED' | 'CONVERTED' | 'REJECTED' | 'CANCELLED' | 'SUPERSEDED';
  currencyCode: string;
  subtotal: string;
  sourceLeadId: string;
  /** Engagement that eventually materialised from this pro-forma. Nullable
   *  because DRAFT / ISSUED / ACCEPTED pro-formas have no engagement yet. */
  engagementId: string | null;
};

/** Payment statuses that contribute to "money received." REJECTED does
 *  not count; VERIFIED / PARTIALLY_REFUNDED / REFUNDED all do — refund
 *  amounts are subtracted separately via the refunds list. */
const COUNTABLE_PAYMENT_STATUSES = new Set<PaymentInput['status']>([
  'VERIFIED',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
]);

function parseDecimal(s: string): number {
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function formatDecimal(n: number): string {
  // Fixed 2dp to match DB numeric(14,2). Floor negatives at 0 — a visible
  // "owed" is never negative; overpayments surface through the per-payment
  // view, not here.
  return (n < 0 ? 0 : n).toFixed(2);
}

export function buildClientBalance(input: {
  engagements: EngagementInput[];
  payments: PaymentInput[];
  refunds: RefundInput[];
  invoices: InvoiceInput[];
  proFormas: ProFormaInput[];
}): {
  engagements: EngagementBalance[];
  pendingQuotes: PendingQuoteBalance[];
  byCurrency: CurrencyRollup[];
} {
  // Per-payment refund totals, keyed by payment id.
  const refundsByPayment = new Map<string, number>();
  for (const r of input.refunds) {
    refundsByPayment.set(
      r.paymentId,
      (refundsByPayment.get(r.paymentId) ?? 0) + parseDecimal(r.amount),
    );
  }

  const engagementRows: EngagementBalance[] = input.engagements.map((e) => {
    const engagePayments = input.payments.filter(
      (p) =>
        p.serviceEngagementId === e.id &&
        p.currencyCode === e.currencyCode &&
        COUNTABLE_PAYMENT_STATUSES.has(p.status),
    );
    const gross = engagePayments.reduce((acc, p) => acc + parseDecimal(p.amount), 0);
    const refundSum = engagePayments.reduce((acc, p) => acc + (refundsByPayment.get(p.id) ?? 0), 0);
    const netPaid = Math.max(0, gross - refundSum);
    const agreed = parseDecimal(e.agreedAmount);
    const outstanding = Math.max(0, agreed - netPaid);

    return {
      engagementId: e.id,
      serviceName: e.serviceName,
      currencyCode: e.currencyCode,
      agreedAmount: formatDecimal(agreed),
      verifiedPaid: formatDecimal(netPaid),
      outstanding: formatDecimal(outstanding),
      status: e.status,
      linkedInvoiceNumbers: input.invoices
        .filter((i) => i.serviceEngagementId === e.id && i.status !== 'VOIDED')
        .map((i) => i.number),
      linkedProFormaNumbers: input.proFormas
        .filter((p) => p.engagementId === e.id)
        .map((p) => p.number),
    };
  });

  // Accepted-but-not-yet-materialised quotes become their own cards. Only
  // ACCEPTED counts — DRAFT / ISSUED aren't a commitment yet, CONVERTED
  // is already reflected in the engagement + invoice.
  const pendingQuotes: PendingQuoteBalance[] = input.proFormas
    .filter((p) => p.status === 'ACCEPTED' && !p.engagementId)
    .map((p) => ({
      proFormaId: p.id,
      proFormaNumber: p.number,
      currencyCode: p.currencyCode,
      agreedAmount: formatDecimal(parseDecimal(p.subtotal)),
      sourceLeadId: p.sourceLeadId,
    }));

  // Per-currency rollups: sum engagements + pending quotes within each
  // currency, never across currencies.
  const rollupMap = new Map<string, { agreed: number; verified: number }>();
  for (const row of engagementRows) {
    const slot = rollupMap.get(row.currencyCode) ?? { agreed: 0, verified: 0 };
    slot.agreed += parseDecimal(row.agreedAmount);
    slot.verified += parseDecimal(row.verifiedPaid);
    rollupMap.set(row.currencyCode, slot);
  }
  for (const pending of pendingQuotes) {
    const slot = rollupMap.get(pending.currencyCode) ?? { agreed: 0, verified: 0 };
    slot.agreed += parseDecimal(pending.agreedAmount);
    rollupMap.set(pending.currencyCode, slot);
  }
  const byCurrency: CurrencyRollup[] = Array.from(rollupMap.entries())
    .map(([currencyCode, { agreed, verified }]) => ({
      currencyCode,
      agreed: formatDecimal(agreed),
      verified: formatDecimal(verified),
      outstanding: formatDecimal(Math.max(0, agreed - verified)),
    }))
    .sort((a, b) => a.currencyCode.localeCompare(b.currencyCode));

  return { engagements: engagementRows, pendingQuotes, byCurrency };
}

import { AlertTriangle, FileText, HandCoins, Hourglass } from 'lucide-react';
import { formatMoney } from '@/components/ds/money';
import { StatTile } from '@/components/ds/stat-tile';
import { isInvoiceOverdue } from '@/modules/billing/aging';
import type { PersonBillingRow } from '@/modules/billing/read';

/**
 * Phase 3 blueprint §9.1 — at-a-glance financial roll-up for a record
 * (candidate / employer / case / requisition).
 *
 * Four cells per currency: Invoiced, Received, Outstanding, Overdue.
 * The whole thing is derived from the same `PersonBillingRow[]` the
 * BillingSection already renders, so there's no extra query cost — the
 * caller passes the list it already has in hand. If invoices span
 * multiple currencies we render one row per currency; mixed currency
 * is rare in practice (ICG trades mainly in EUR) but the component
 * doesn't collapse mixed money into a wrong total.
 *
 * Voided invoices are excluded from Invoiced / Outstanding / Overdue
 * (there's nothing to collect) but still count towards Received if a
 * payment landed before the void — the receipt is already issued.
 */
export function FinancialSummaryCard({ invoices }: { invoices: PersonBillingRow[] }) {
  if (invoices.length === 0) return null;

  // Roll up per currency so a candidate who happens to carry both EUR
  // and GBP invoices doesn't see a nonsense total.
  const perCurrency = new Map<
    string,
    { invoiced: number; received: number; outstanding: number; overdueCount: number }
  >();
  for (const row of invoices) {
    const cur = row.invoice.currencyCode;
    const bucket = perCurrency.get(cur) ?? {
      invoiced: 0,
      received: 0,
      outstanding: 0,
      overdueCount: 0,
    };
    const total = Number.parseFloat(row.invoice.totalAmount) || 0;
    const paid = Number.parseFloat(row.paidAmount) || 0;
    const outstanding = Number.parseFloat(row.outstandingAmount) || 0;
    if (row.invoice.status !== 'VOIDED') {
      bucket.invoiced += total;
      bucket.outstanding += outstanding;
      if (isInvoiceOverdue(row.invoice)) bucket.overdueCount += 1;
    }
    bucket.received += paid;
    perCurrency.set(cur, bucket);
  }

  const rows = Array.from(perCurrency.entries()).sort(([a], [b]) => a.localeCompare(b));

  return (
    // Sized to its own container, not the window: four tiles across only
    // when the card is wide (full-width Employer billing); two by two in
    // narrower columns (Immigration case, Job billing) so amounts never clip.
    <div className="@container space-y-3">
      {rows.map(([currencyCode, b]) => (
        <div key={currencyCode} className="space-y-2">
          {rows.length > 1 && (
            <p className="text-xs font-medium text-muted-foreground">{currencyCode}</p>
          )}
          <div className="grid grid-cols-2 gap-3 @4xl:grid-cols-4">
            <StatTile
              icon={FileText}
              tone="blue"
              label="Invoiced"
              value={formatMoney(b.invoiced.toFixed(2), currencyCode)}
            />
            <StatTile
              icon={HandCoins}
              tone="green"
              label="Received"
              value={formatMoney(b.received.toFixed(2), currencyCode)}
            />
            <StatTile
              icon={Hourglass}
              tone={b.outstanding > 0 ? 'amber' : 'slate'}
              label="Outstanding"
              value={formatMoney(b.outstanding.toFixed(2), currencyCode)}
            />
            <StatTile
              icon={AlertTriangle}
              tone={b.overdueCount > 0 ? 'rose' : 'slate'}
              label="Overdue"
              value={
                b.overdueCount === 0
                  ? 'None'
                  : `${b.overdueCount} ${b.overdueCount === 1 ? 'invoice' : 'invoices'}`
              }
            />
          </div>
        </div>
      ))}
    </div>
  );
}

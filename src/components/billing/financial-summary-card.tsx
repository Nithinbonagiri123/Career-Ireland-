import { AlertTriangle, FileText, HandCoins, Hourglass } from 'lucide-react';
import { formatCurrency } from '@/lib/currency';
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
    <div className="space-y-3">
      {rows.map(([currencyCode, b]) => {
        const overdueTone = b.overdueCount > 0 ? 'text-status-danger' : 'text-muted-foreground';
        const outstandingTone = b.outstanding > 0 ? 'text-status-warning' : 'text-muted-foreground';
        return (
          <div
            key={currencyCode}
            className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4"
          >
            <Cell
              icon={FileText}
              label="Invoiced"
              value={formatCurrency(b.invoiced.toFixed(2), currencyCode)}
            />
            <Cell
              icon={HandCoins}
              label="Received"
              value={formatCurrency(b.received.toFixed(2), currencyCode)}
              tone="text-status-success"
            />
            <Cell
              icon={Hourglass}
              label="Outstanding"
              value={formatCurrency(b.outstanding.toFixed(2), currencyCode)}
              tone={outstandingTone}
            />
            <Cell
              icon={AlertTriangle}
              label="Overdue"
              value={
                b.overdueCount === 0
                  ? 'None'
                  : `${b.overdueCount} ${b.overdueCount === 1 ? 'invoice' : 'invoices'}`
              }
              tone={overdueTone}
            />
          </div>
        );
      })}
    </div>
  );
}

function Cell({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="flex items-start gap-2.5 bg-card px-4 py-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 space-y-0.5">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={`tabular-nums text-sm font-semibold ${tone ?? ''}`.trim()}>{value}</p>
      </div>
    </div>
  );
}

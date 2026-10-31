import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { DsTable, DsTBody, DsTd, DsTFoot, DsTHead, DsTh, DsTr } from './data-table';
import { Money } from './money';

/**
 * Financial statement (trial balance, P&L, balance sheet, VAT): sections
 * with heading rows, account rows, a subtotal per section and grand
 * totals in <tfoot>. Amounts use <Money> (one negative convention). Scrolls
 * inside its card on phones rather than clipping the amount column.
 */

export type StatementRow = {
  key: string;
  code?: string | null;
  name: ReactNode;
  /** Small secondary line under the name (division, note). */
  note?: ReactNode;
  /** One value per amount column, in column order. */
  amounts: Array<number | string | null>;
};

export type StatementSection = {
  key: string;
  title: string;
  rows: StatementRow[];
  /** Subtotal per amount column; omitted → no subtotal row. */
  subtotal?: Array<number | string | null>;
  subtotalLabel?: string;
  /** Shown when the section has no rows. */
  emptyText?: string;
};

export function StatementTable({
  label,
  caption,
  currency,
  amountColumns,
  sections,
  totals = [],
  showCode = true,
  minWidth = 560,
  card = true,
  testId,
}: {
  label: string;
  caption?: ReactNode;
  currency: string;
  /** Header of each amount column, e.g. ["Debit", "Credit"] or ["Amount"]. */
  amountColumns: string[];
  sections: StatementSection[];
  /** Grand-total rows rendered in <tfoot>. */
  totals?: Array<{ key: string; label: ReactNode; amounts: Array<number | string | null> }>;
  showCode?: boolean;
  minWidth?: number;
  card?: boolean;
  testId?: string;
}) {
  const span = (showCode ? 2 : 1) + amountColumns.length;
  return (
    <DsTable label={label} caption={caption} minWidth={minWidth} card={card} testId={testId}>
      <DsTHead>
        <tr>
          {showCode && <DsTh className="w-24">Code</DsTh>}
          <DsTh>Account</DsTh>
          {amountColumns.map((c) => (
            <DsTh key={c} numeric>
              {c}
            </DsTh>
          ))}
        </tr>
      </DsTHead>
      {sections.map((s) => (
        <DsTBody key={s.key}>
          <tr className="bg-muted/30">
            <th
              scope="colgroup"
              colSpan={span}
              className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-foreground/80"
            >
              {s.title}
            </th>
          </tr>
          {s.rows.length === 0 ? (
            <DsTr>
              <DsTd colSpan={span} className="text-center text-xs text-muted-foreground">
                {s.emptyText ?? 'No accounts with a balance.'}
              </DsTd>
            </DsTr>
          ) : (
            s.rows.map((r) => (
              <DsTr key={r.key}>
                {showCode && (
                  <DsTd className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                    {r.code ?? '—'}
                  </DsTd>
                )}
                <DsTd className="min-w-0">
                  <div className="text-foreground">{r.name}</div>
                  {r.note && <div className="mt-0.5 text-xs text-muted-foreground">{r.note}</div>}
                </DsTd>
                {r.amounts.map((a, i) => (
                  <DsTd key={amountColumns[i] ?? i} numeric>
                    {a === null ? '' : <Money amount={a} currency={currency} tone="negative" />}
                  </DsTd>
                ))}
              </DsTr>
            ))
          )}
          {s.subtotal && (
            <tr className="border-t border-border/70 font-medium">
              <th
                scope="row"
                colSpan={showCode ? 2 : 1}
                className="px-4 py-2.5 text-left text-sm font-medium"
              >
                {s.subtotalLabel ?? `Total ${s.title.toLowerCase()}`}
              </th>
              {s.subtotal.map((a, i) => (
                <DsTd key={amountColumns[i] ?? i} numeric className="py-2.5">
                  {a === null ? '' : <Money amount={a} currency={currency} tone="negative" />}
                </DsTd>
              ))}
            </tr>
          )}
        </DsTBody>
      ))}
      {totals.length > 0 && (
        <DsTFoot>
          {totals.map((t) => (
            <tr key={t.key}>
              <th
                scope="row"
                colSpan={showCode ? 2 : 1}
                className={cn('px-4 py-3 text-left text-sm font-semibold uppercase tracking-wide')}
              >
                {t.label}
              </th>
              {t.amounts.map((a, i) => (
                <DsTd key={amountColumns[i] ?? i} numeric className="text-base font-semibold">
                  {a === null ? '' : <Money amount={a} currency={currency} tone="negative" />}
                </DsTd>
              ))}
            </tr>
          ))}
        </DsTFoot>
      )}
    </DsTable>
  );
}

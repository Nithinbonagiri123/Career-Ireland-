import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/auth/session';
import { fetchVatDetail } from '@/modules/accounting/vat';

/**
 * CSV export of every tax_transactions row in `[from, to]`. One row per
 * tax-relevant event (invoice line, future supplier bill line) so
 * finance can reconcile the VAT3 totals against the underlying detail
 * before filing with Revenue.
 *
 * Not a ROS XML export — that is Phase 5.5. The CSV is Excel-friendly
 * and covers the day-to-day reconciliation use case; the XML will
 * follow once we have at least one filed return to validate the format
 * against.
 */
export async function GET(req: Request) {
  await requirePermission('main', 'accounting', 'view');

  const url = new URL(req.url);
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json(
      { ok: false, error: 'from and to must be YYYY-MM-DD' },
      { status: 400 },
    );
  }

  const rows = await fetchVatDetail(new Date(from), new Date(to));

  // Hand-rolled CSV — zero dep. Escapes quotes + wraps anything with
  // commas/quotes/newlines in a quoted field.
  const esc = (v: string | null | undefined): string => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = [
    'transaction_date',
    'source_type',
    'source_id',
    'direction',
    'tax_code',
    'tax_rate_percent',
    'net_amount',
    'tax_amount',
    'currency_code',
    'division_code',
    'description',
  ].join(',');
  const body = rows
    .map((r) =>
      [
        r.transactionDate,
        esc(r.sourceType),
        esc(r.sourceId),
        r.direction,
        esc(r.taxCode),
        r.taxRatePercent,
        r.netAmount,
        r.taxAmount,
        r.currencyCode,
        esc(r.divisionCode),
        esc(r.description),
      ].join(','),
    )
    .join('\n');
  const csv = `${header}\n${body}\n`;

  const filename = `vat-${from}-to-${to}.csv`;
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

import { format } from 'date-fns';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Coins,
  GraduationCap,
  PlaneTakeoff,
  Trophy,
} from 'lucide-react';
import { CsvExportButton } from '@/components/csv-export-button';
import { DateRangeFilter } from '@/components/date-range-filter';
import { EmptyState } from '@/components/empty-state';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type {
  DashboardRevenue,
  RevenueByStream,
  RevenueCurrencyTotal,
  RevenueSource,
} from '@/modules/dashboard/revenue';
import { StatChip } from './stat-chip';

/**
 * Revenue section for the Main Dashboard. Renders three tiers:
 *
 *  1. Rolled-up totals per currency (one StatChip per currency) with a
 *     MoM delta chip stacked underneath.
 *  2. Per-stream breakdown (candidate services / placements /
 *     immigration) — one card each, showing per-currency totals.
 *  3. Top services within the range, with a CSV export of the full
 *     services list (not just the truncated Top-8).
 *
 * The section owns a URL-driven date range via <DateRangeFilter />;
 * the server aggregator defaults to MTD when the URL has no bounds
 * and always computes the previous-month window for the MoM tile.
 */

const STREAM_META: Record<RevenueSource, { label: string; icon: typeof Coins; href: string }> = {
  candidate_services: {
    label: 'Candidate services',
    icon: GraduationCap,
    href: '/dashboard/candidate-services',
  },
  placements: { label: 'Placements', icon: Trophy, href: '/placements' },
  immigration: { label: 'Immigration', icon: PlaneTakeoff, href: '/immigration' },
};

const currencyFormatterCache = new Map<string, Intl.NumberFormat>();
function formatMoney(amount: number, currencyCode: string): string {
  let fmt = currencyFormatterCache.get(currencyCode);
  if (!fmt) {
    try {
      fmt = new Intl.NumberFormat('en-IE', {
        style: 'currency',
        currency: currencyCode,
        maximumFractionDigits: 0,
      });
    } catch {
      // Fallback for non-ISO or unknown currency codes.
      fmt = new Intl.NumberFormat('en-IE', { maximumFractionDigits: 0 });
    }
    currencyFormatterCache.set(currencyCode, fmt);
  }
  return fmt.format(amount);
}

function formatRangeLabel(from: Date, to: Date): string {
  const sameYear = from.getFullYear() === to.getFullYear();
  const sameMonth = sameYear && from.getMonth() === to.getMonth();
  if (sameMonth) {
    return `${format(from, 'd')}–${format(to, 'd MMM yyyy')}`;
  }
  if (sameYear) {
    return `${format(from, 'd MMM')} – ${format(to, 'd MMM yyyy')}`;
  }
  return `${format(from, 'd MMM yyyy')} – ${format(to, 'd MMM yyyy')}`;
}

/**
 * Encode the URL params the CSV route uses. We forward the same
 * from/to the section is already showing so the export matches the
 * on-screen data.
 */
function buildCsvHref(range: { from: Date; to: Date }): string {
  const fromParam = format(range.from, 'yyyy-MM-dd');
  const toParam = format(range.to, 'yyyy-MM-dd');
  return `/api/export/revenue-services?from=${fromParam}&to=${toParam}`;
}

export function RevenueSection({ data }: { data: DashboardRevenue }) {
  const { range, byStream, totalsByCurrency, previousTotalsByCurrency, services } = data;
  const hasRevenue = totalsByCurrency.length > 0;
  const previousByCurrency = new Map(
    previousTotalsByCurrency.map((r) => [r.currencyCode, r] as const),
  );
  const topServices = services.slice(0, 8);

  return (
    <section aria-label="Revenue" className="mb-8">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Revenue
          </h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Verified payments · {formatRangeLabel(range.from, range.to)}
          </p>
        </div>
        <DateRangeFilter />
      </div>

      {!hasRevenue ? (
        <Card>
          <CardContent className="py-8">
            <EmptyState
              icon={Coins}
              title="No verified revenue in this range"
              description="Verified payments in the selected window will roll up here per currency and per stream."
            />
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ── Rolled-up totals + MoM delta ──────────────────────── */}
          <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {totalsByCurrency.map((t) => {
              const previous = previousByCurrency.get(t.currencyCode);
              return (
                <div key={t.currencyCode} className="space-y-1.5">
                  <StatChip
                    label={`Revenue · ${t.currencyCode}`}
                    value={formatMoney(t.total, t.currencyCode)}
                    hint={`${t.count} verified payment${t.count === 1 ? '' : 's'}`}
                    href="/payments"
                    icon={Coins}
                    tone="success"
                  />
                  <MomChip current={t} previous={previous} />
                </div>
              );
            })}
          </div>

          {/* ── Per-stream breakdown ────────────────────────────── */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {byStream.map((s) => (
              <StreamCard key={s.source} stream={s} />
            ))}
          </div>

          {/* ── Top services ────────────────────────────────────── */}
          {topServices.length > 0 && (
            <div className="mt-6">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex items-baseline gap-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Top services
                  </h3>
                  <span className="text-[11px] text-muted-foreground">
                    Ordered by revenue in the selected range.
                  </span>
                </div>
                <CsvExportButton
                  href={buildCsvHref(range)}
                  label={`Download all ${services.length} services`}
                />
              </div>
              <div className="overflow-hidden rounded-lg border bg-card">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/20 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 font-medium">Service</th>
                      <th className="px-4 py-2 font-medium">Stream</th>
                      <th className="px-4 py-2 font-medium">Payments</th>
                      <th className="px-4 py-2 text-right font-medium">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topServices.map((r) => (
                      <tr
                        key={`${r.source}::${r.serviceCode}::${r.currencyCode}`}
                        className="border-b last:border-b-0 hover:bg-muted/20"
                      >
                        <td className="px-4 py-2">
                          <div className="text-sm font-medium">{r.serviceName}</div>
                          <div className="text-[11px] text-muted-foreground">{r.serviceCode}</div>
                        </td>
                        <td className="px-4 py-2 text-xs">
                          <Badge variant="outline" className="rounded-full text-[10px]">
                            {STREAM_META[r.source].label}
                          </Badge>
                        </td>
                        <td className="px-4 py-2 text-xs tabular-nums text-muted-foreground">
                          {r.count}
                        </td>
                        <td className="px-4 py-2 text-right text-sm font-medium tabular-nums">
                          {formatMoney(r.total, r.currencyCode)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function MomChip({
  current,
  previous,
}: {
  current: RevenueCurrencyTotal;
  previous: RevenueCurrencyTotal | undefined;
}) {
  // No prior data → we can't compute a % change without dividing by
  // zero; render a neutral "new this month" chip instead.
  if (!previous || previous.total === 0) {
    return (
      <div className="flex items-center gap-1.5 rounded-md border bg-muted/20 px-2 py-1 text-[11px] text-muted-foreground">
        <ArrowRight className="size-3" aria-hidden />
        <span>New vs. previous month ({current.currencyCode})</span>
      </div>
    );
  }

  const delta = current.total - previous.total;
  const pct = (delta / previous.total) * 100;
  const up = pct >= 0;
  const Icon = up ? ArrowUp : ArrowDown;
  const label = `${up ? '+' : ''}${pct.toFixed(1)}%`;

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px]',
        up
          ? 'border-status-success/40 bg-status-success-soft text-status-success'
          : 'border-status-danger/40 bg-status-danger-soft text-status-danger',
      )}
    >
      <Icon className="size-3" aria-hidden />
      <span className="font-medium tabular-nums">{label}</span>
      <span className="text-muted-foreground">
        vs. {formatMoney(previous.total, current.currencyCode)}
      </span>
    </div>
  );
}

function StreamCard({ stream }: { stream: RevenueByStream }) {
  const meta = STREAM_META[stream.source];
  const Icon = meta.icon;
  const isEmpty = stream.byCurrency.length === 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <Icon className="size-3.5" aria-hidden />
          </div>
          <CardTitle className="text-sm">{meta.label}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <p className="text-xs text-muted-foreground">No revenue in this range.</p>
        ) : (
          <ul className="space-y-1.5">
            {stream.byCurrency.map((c) => (
              <li
                key={c.currencyCode}
                className="flex items-baseline justify-between gap-2 text-sm"
              >
                <span className="text-xs text-muted-foreground">
                  {c.currencyCode} · {c.count}
                </span>
                <span className="font-medium tabular-nums">
                  {formatMoney(c.total, c.currencyCode)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

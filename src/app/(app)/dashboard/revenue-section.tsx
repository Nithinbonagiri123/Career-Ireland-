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
import { DsTable, DsTBody, DsTd, DsTHead, DsTh, DsTr } from '@/components/ds/data-table';
import { formatMoney as formatMoneyDs } from '@/components/ds/money';
import { DsStatusPill } from '@/components/ds/status-pill';
import { DS_SOFT } from '@/components/ds/tones';
import { EmptyState } from '@/components/empty-state';
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

/** Dashboard summaries show whole units (as before), via the kit formatter. */
function formatMoney(amount: number, currencyCode: string): string {
  return formatMoneyDs(amount, currencyCode, { decimals: false });
}

/** Stage 6G card surface used by the stream cards and the empty state. */
const CARD = 'min-w-0 rounded-2xl border border-border/60 bg-card shadow-sm';

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

export function RevenueSection({
  data,
  canExport = false,
}: {
  data: DashboardRevenue;
  /** Finance-read users only — the CSV route returns 403 to everyone else. */
  canExport?: boolean;
}) {
  const { range, byStream, totalsByCurrency, previousTotalsByCurrency, services } = data;
  const hasRevenue = totalsByCurrency.length > 0;
  const previousByCurrency = new Map(
    previousTotalsByCurrency.map((r) => [r.currencyCode, r] as const),
  );
  const topServices = services.slice(0, 8);

  return (
    <section aria-label="Revenue" data-testid="revenue-section" className="mb-8">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground/75">
            Revenue
          </h2>
          <p className="mt-0.5 text-[11px] text-foreground/60">
            Verified payments · {formatRangeLabel(range.from, range.to)}
          </p>
        </div>
        <DateRangeFilter />
      </div>

      {!hasRevenue ? (
        <div className={cn(CARD, 'px-4 py-8')}>
          <EmptyState
            icon={Coins}
            title="No verified revenue in this range"
            description="Verified payments in the selected window will roll up here per currency and per stream."
          />
        </div>
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
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground/75">
                    Top services
                  </h3>
                  <span className="text-[11px] text-foreground/60">
                    Ordered by revenue in the selected range.
                  </span>
                </div>
                {canExport && (
                  <CsvExportButton
                    href={buildCsvHref(range)}
                    label={`Download all ${services.length} services`}
                  />
                )}
              </div>
              {/* Scrolls inside its own region on narrow screens instead of
                  being clipped by the card. */}
              <DsTable
                label="Top services"
                caption="Top services by verified revenue in the selected range"
                minWidth={520}
                testId="revenue-top-services"
              >
                <DsTHead>
                  <tr>
                    <DsTh>Service</DsTh>
                    <DsTh>Stream</DsTh>
                    <DsTh numeric>Payments</DsTh>
                    <DsTh numeric>Revenue</DsTh>
                  </tr>
                </DsTHead>
                <DsTBody>
                  {topServices.map((r) => (
                    <DsTr
                      key={`${r.source}::${r.serviceCode}::${r.currencyCode}`}
                      className="hover:bg-muted/30"
                    >
                      <DsTd>
                        <div className="text-sm font-medium text-foreground">{r.serviceName}</div>
                        <div className="text-[11px] text-muted-foreground">{r.serviceCode}</div>
                      </DsTd>
                      <DsTd>
                        <DsStatusPill tone="slate">{STREAM_META[r.source].label}</DsStatusPill>
                      </DsTd>
                      <DsTd numeric className="text-xs text-muted-foreground">
                        {r.count}
                      </DsTd>
                      <DsTd numeric className="font-medium text-foreground">
                        {formatMoney(r.total, r.currencyCode)}
                      </DsTd>
                    </DsTr>
                  ))}
                </DsTBody>
              </DsTable>
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
    <section aria-label={`${meta.label} revenue`} className={cn(CARD, 'p-4')}>
      <div className="mb-3 flex items-center gap-2.5">
        <span
          aria-hidden
          className={cn('grid size-8 shrink-0 place-items-center rounded-lg', DS_SOFT.blue)}
        >
          <Icon className="size-4" />
        </span>
        <h3 className="text-sm font-semibold text-foreground">{meta.label}</h3>
      </div>
      <div>
        {isEmpty ? (
          <p className="py-2 text-center text-xs text-foreground/55">No revenue in this range.</p>
        ) : (
          <ul className="space-y-1.5">
            {stream.byCurrency.map((c) => (
              <li
                key={c.currencyCode}
                className="flex items-baseline justify-between gap-2 text-sm"
              >
                <span className="text-xs text-muted-foreground">
                  {c.currencyCode} · {c.count} payment{c.count === 1 ? '' : 's'}
                </span>
                <span className="font-medium tabular-nums">
                  {formatMoney(c.total, c.currencyCode)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

'use client';

import { format, parseISO } from 'date-fns';
import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatCurrency } from '@/lib/currency';
import type {
  RevenueServiceRow,
  RevenueSource,
  RevenueTrendPoint,
} from '@/modules/dashboard/revenue';

const SOURCE_META: Record<RevenueSource, { label: string; stroke: string; fill: string }> = {
  candidate_services: {
    label: 'Candidate services',
    stroke: 'oklch(0.55 0.16 245)',
    fill: 'oklch(0.85 0.08 245)',
  },
  placements: {
    label: 'Recruitment',
    stroke: 'oklch(0.58 0.14 145)',
    fill: 'oklch(0.85 0.08 145)',
  },
  immigration: {
    label: 'Immigration',
    stroke: 'oklch(0.62 0.16 300)',
    fill: 'oklch(0.85 0.07 300)',
  },
};

const PIE_PALETTE = [
  'oklch(0.55 0.16 245)', // navy
  'oklch(0.58 0.14 145)', // emerald
  'oklch(0.62 0.16 300)', // violet
  'oklch(0.66 0.15 70)', // amber
  'oklch(0.6 0.19 25)', // rose
  'oklch(0.6 0.11 200)', // teal
  'oklch(0.58 0.14 340)', // magenta
  'oklch(0.5 0.15 60)', // warm bronze
];

/**
 * Pie + line combo for a single business (source). The pie shows the
 * revenue MIX inside that business (which services drove the number);
 * the line shows the DAILY revenue trend within the selected range.
 * Both charts are wrapped in the shared `glass-panel` so they inherit
 * the app's frosted look.
 *
 * Currency-aware: if the business collected multiple currencies, we
 * render the primary (highest-total) currency's chart and note the
 * others.  MoM/YoY comparisons live in the parent `RevenueSection`.
 */
export function RevenueBusinessChart({
  source,
  services,
  trend,
  emptyLabel = 'No verified revenue in this range.',
}: {
  source: RevenueSource;
  services: RevenueServiceRow[];
  trend: RevenueTrendPoint[];
  emptyLabel?: string;
}) {
  const meta = SOURCE_META[source];

  // Pie: revenue mix per service, restricted to this source and the
  // primary currency (the currency with the largest total).
  const { pieRows, primaryCurrency, otherCurrencies } = useMemo(() => {
    const sourceServices = services.filter((s) => s.source === source);
    const currencyTotals = new Map<string, number>();
    for (const s of sourceServices) {
      currencyTotals.set(s.currencyCode, (currencyTotals.get(s.currencyCode) ?? 0) + s.total);
    }
    const sorted = [...currencyTotals.entries()].sort((a, b) => b[1] - a[1]);
    const primary = sorted[0]?.[0] ?? 'EUR';
    const others = sorted.slice(1).map(([c]) => c);
    const rows = sourceServices
      .filter((s) => s.currencyCode === primary)
      .sort((a, b) => b.total - a.total)
      .slice(0, 6)
      .map((s) => ({ name: s.serviceName, value: s.total }));
    return { pieRows: rows, primaryCurrency: primary, otherCurrencies: others };
  }, [services, source]);

  // Line: daily revenue for this source in the primary currency,
  // filling gaps with zero so the axis reads chronologically.
  const lineRows = useMemo(() => {
    const bySource = trend.filter((t) => t.source === source && t.currencyCode === primaryCurrency);
    return bySource.map((p) => ({ date: p.date, total: p.total }));
  }, [trend, source, primaryCurrency]);

  const totalRevenue = pieRows.reduce((sum, r) => sum + r.value, 0);
  const hasData = totalRevenue > 0 || lineRows.length > 0;

  if (!hasData) {
    return (
      <div className="glass-panel rounded-lg p-6">
        <header className="mb-2 flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block size-2.5 rounded-full"
            style={{ backgroundColor: meta.stroke }}
          />
          <h3 className="text-sm font-medium">{meta.label}</h3>
        </header>
        <p className="py-4 text-center text-xs text-foreground/55">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-lg p-4">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block size-2.5 rounded-full"
            style={{ backgroundColor: meta.stroke }}
          />
          <h3 className="text-sm font-medium">{meta.label}</h3>
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold leading-none tabular-nums">
            {formatCurrency(totalRevenue, primaryCurrency, { maximumFractionDigits: 0 })}
          </div>
          {otherCurrencies.length > 0 && (
            <div className="mt-0.5 text-[10px] text-foreground/50">
              + {otherCurrencies.join(', ')}
            </div>
          )}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-5">
        {/* Pie — service mix (2 columns) */}
        <div className="sm:col-span-2">
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-foreground/60">
            Service mix
          </p>
          <div className="h-40 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieRows}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={30}
                  outerRadius={62}
                  paddingAngle={2}
                  isAnimationActive
                  animationDuration={500}
                >
                  {pieRows.map((row, i) => (
                    <Cell key={row.name} fill={PIE_PALETTE[i % PIE_PALETTE.length]} stroke="none" />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: 'var(--color-popover)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 8,
                    fontSize: 11,
                    padding: '4px 8px',
                  }}
                  formatter={(value, name) => [
                    formatCurrency(Number(value ?? 0), primaryCurrency, {
                      maximumFractionDigits: 0,
                    }),
                    String(name ?? ''),
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-1 space-y-0.5 text-[10px]">
            {pieRows.slice(0, 4).map((r, i) => (
              <li key={r.name} className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="inline-block size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: PIE_PALETTE[i % PIE_PALETTE.length] }}
                />
                <span className="truncate text-foreground/70">{r.name}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Line — daily trend (3 columns) */}
        <div className="sm:col-span-3">
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-foreground/60">
            Daily trend · {primaryCurrency}
          </p>
          <div className="h-44 w-full">
            {lineRows.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-foreground/55">
                No daily activity in range.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={lineRows} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id={`revBiz-${source}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={meta.stroke} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={meta.stroke} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="date"
                    tickFormatter={(v: string) => format(parseISO(v), 'd MMM')}
                    tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                    minTickGap={40}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
                    tickLine={false}
                    axisLine={false}
                    width={40}
                    tickFormatter={(v: number) =>
                      v >= 1000 ? `${Math.round(v / 100) / 10}k` : String(v)
                    }
                  />
                  <Tooltip
                    cursor={{ stroke: meta.stroke, strokeOpacity: 0.35 }}
                    contentStyle={{
                      background: 'var(--color-popover)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 8,
                      fontSize: 11,
                      padding: '4px 8px',
                    }}
                    labelFormatter={(label) =>
                      typeof label === 'string'
                        ? format(parseISO(label), 'EEE, d MMM yyyy')
                        : String(label)
                    }
                    formatter={(value) => [
                      formatCurrency(Number(value ?? 0), primaryCurrency, {
                        maximumFractionDigits: 0,
                      }),
                      'Revenue',
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke={meta.stroke}
                    strokeWidth={2}
                    fill={`url(#revBiz-${source})`}
                    fillOpacity={1}
                    isAnimationActive
                    animationDuration={500}
                    animationEasing="ease-out"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Grid wrapper for the Main Dashboard ────────────────────────────── */

export function RevenueBusinessGrid({
  services,
  trend,
}: {
  services: RevenueServiceRow[];
  trend: RevenueTrendPoint[];
}) {
  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
      <RevenueBusinessChart source="candidate_services" services={services} trend={trend} />
      <RevenueBusinessChart source="placements" services={services} trend={trend} />
      <RevenueBusinessChart source="immigration" services={services} trend={trend} />
    </div>
  );
}

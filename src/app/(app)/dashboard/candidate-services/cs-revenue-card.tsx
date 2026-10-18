'use client';

import { format, parseISO } from 'date-fns';
import { BarChart3 } from 'lucide-react';
import { useMemo, useState } from 'react';
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
import { cn } from '@/lib/utils';
import type {
  RevenueCurrencyTotal,
  RevenueServiceRow,
  RevenueTrendPoint,
} from '@/modules/dashboard/revenue';

/**
 * Stage 6G — Candidate Services dashboard revenue card, matching the
 * approved mockup: header with total + vs-previous-month delta on the
 * right, service-mix donut with centred total + legend on the left,
 * daily revenue trend with a Day / Week / Month toggle on the right.
 */

const MIX_PALETTE = [
  'oklch(0.55 0.16 245)', // blue
  'oklch(0.58 0.14 145)', // emerald
  'oklch(0.62 0.16 300)', // violet
  'oklch(0.66 0.15 70)', // amber
  'oklch(0.6 0.19 25)', // rose
  'oklch(0.6 0.11 200)', // teal
];

type Granularity = 'day' | 'week' | 'month';

export function CsRevenueCard({
  services,
  trend,
  totals,
  previousTotals,
}: {
  services: RevenueServiceRow[];
  trend: RevenueTrendPoint[];
  totals: RevenueCurrencyTotal[];
  previousTotals: RevenueCurrencyTotal[];
}) {
  const [granularity, setGranularity] = useState<Granularity>('day');

  const { mixRows, primaryCurrency, total } = useMemo(() => {
    const cs = services.filter((s) => s.source === 'candidate_services');
    const currencyTotals = new Map<string, number>();
    for (const s of cs) {
      currencyTotals.set(s.currencyCode, (currencyTotals.get(s.currencyCode) ?? 0) + s.total);
    }
    const primary =
      [...currencyTotals.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ??
      totals[0]?.currencyCode ??
      'EUR';
    const rows = cs
      .filter((s) => s.currencyCode === primary)
      .sort((a, b) => b.total - a.total)
      .slice(0, 6)
      .map((s) => ({ name: s.serviceName, value: s.total }));
    return {
      mixRows: rows,
      primaryCurrency: primary,
      total: rows.reduce((sum, r) => sum + r.value, 0),
    };
  }, [services, totals]);

  // MoM delta from the same currency's previous-window total.
  const momDeltaPct = useMemo(() => {
    const prev = previousTotals.find((t) => t.currencyCode === primaryCurrency)?.total ?? 0;
    if (prev <= 0) return null;
    return Math.round(((total - prev) / prev) * 100);
  }, [previousTotals, primaryCurrency, total]);

  const trendRows = useMemo(() => {
    const daily = trend
      .filter((t) => t.source === 'candidate_services' && t.currencyCode === primaryCurrency)
      .sort((a, b) => a.date.localeCompare(b.date));
    if (granularity === 'day') {
      return daily.map((p) => ({ label: p.date, total: p.total }));
    }
    const bucket = new Map<string, number>();
    for (const p of daily) {
      const d = parseISO(p.date);
      const key = granularity === 'week' ? format(d, "RRRR-'W'II") : format(d, 'yyyy-MM');
      bucket.set(key, (bucket.get(key) ?? 0) + p.total);
    }
    return [...bucket.entries()].map(([label, t]) => ({ label, total: t }));
  }, [trend, primaryCurrency, granularity]);

  const hasData = total > 0 || trendRows.length > 0;

  return (
    <section className="rounded-2xl border bg-card p-5 shadow-sm ring-1 ring-border/60 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span
            aria-hidden
            className="grid size-9 shrink-0 place-items-center rounded-lg bg-sky-100 text-sky-700"
          >
            <BarChart3 className="size-4.5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground">Revenue this month</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Service mix and daily trend for candidate services.
            </p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs text-muted-foreground">Total revenue</p>
          <p className="text-2xl font-semibold tabular-nums tracking-tight text-foreground">
            {formatCurrency(String(total), primaryCurrency)}
          </p>
          {momDeltaPct !== null && (
            <p
              className={cn(
                'mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
                momDeltaPct >= 0
                  ? 'bg-status-success-soft text-status-success'
                  : 'bg-rose-100 text-rose-700',
              )}
            >
              {momDeltaPct >= 0 ? '↑' : '↓'} {momDeltaPct >= 0 ? '+' : ''}
              {momDeltaPct}%{' '}
              <span className="font-normal text-muted-foreground">vs. previous month</span>
            </p>
          )}
        </div>
      </header>

      {!hasData ? (
        <p className="py-10 text-center text-xs text-muted-foreground">
          No verified revenue in this range yet.
        </p>
      ) : (
        <div className="mt-5 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          {/* Service mix donut + legend */}
          <div>
            <h3 className="text-sm font-semibold text-foreground">Service mix</h3>
            <div className="mt-2 flex flex-wrap items-center gap-5">
              <div className="relative h-44 w-44 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={mixRows}
                      dataKey="value"
                      nameKey="name"
                      innerRadius="62%"
                      outerRadius="100%"
                      paddingAngle={2}
                      strokeWidth={0}
                      isAnimationActive={false}
                    >
                      {mixRows.map((row, i) => (
                        <Cell key={row.name} fill={MIX_PALETTE[i % MIX_PALETTE.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => formatCurrency(String(v ?? 0), primaryCurrency)} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 grid place-items-center">
                  <div className="text-center">
                    <p className="text-sm font-semibold tabular-nums text-foreground">
                      {formatCurrency(String(total), primaryCurrency)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Total</p>
                  </div>
                </div>
              </div>
              <ul className="min-w-0 flex-1 space-y-2.5 text-xs">
                {mixRows.map((row, i) => (
                  <li key={row.name} className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: MIX_PALETTE[i % MIX_PALETTE.length] }}
                    />
                    <span className="min-w-0 flex-1 truncate text-foreground">{row.name}</span>
                    <span className="shrink-0 tabular-nums font-medium text-foreground">
                      {formatCurrency(String(row.value), primaryCurrency)}
                    </span>
                    <span className="w-9 shrink-0 text-right tabular-nums text-muted-foreground">
                      {total > 0 ? Math.round((row.value / total) * 100) : 0}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Daily trend + granularity toggle */}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-foreground">
                Daily revenue trend ({primaryCurrency})
              </h3>
              <div className="inline-flex overflow-hidden rounded-lg border bg-background text-xs">
                {(['day', 'week', 'month'] as const).map((g, i) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGranularity(g)}
                    aria-pressed={granularity === g}
                    className={cn(
                      'px-2.5 py-1 font-medium capitalize transition-colors',
                      i > 0 && 'border-l',
                      granularity === g
                        ? 'bg-muted text-foreground'
                        : 'text-muted-foreground hover:bg-muted/60',
                    )}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-2 h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendRows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="csTrendFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="oklch(0.55 0.16 245)" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="oklch(0.55 0.16 245)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: string) =>
                      granularity === 'day' ? format(parseISO(v), 'd MMM') : v
                    }
                  />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    width={44}
                    tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`)}
                  />
                  <Tooltip
                    labelFormatter={(v) =>
                      granularity === 'day' ? format(parseISO(String(v)), 'd MMM yyyy') : String(v)
                    }
                    formatter={(v) => [formatCurrency(String(v ?? 0), primaryCurrency), 'Revenue']}
                  />
                  <Area
                    isAnimationActive={false}
                    type="monotone"
                    dataKey="total"
                    stroke="oklch(0.55 0.16 245)"
                    strokeWidth={2}
                    fill="url(#csTrendFill)"
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

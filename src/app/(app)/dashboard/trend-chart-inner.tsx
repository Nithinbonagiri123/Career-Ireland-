'use client';

import { format, parseISO } from 'date-fns';
import type { ReactNode } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { StatusTone } from '@/components/ui/status-dot';
import { cn } from '@/lib/utils';
import type { TrendPoint } from '@/modules/dashboard/trends';

/**
 * The actual recharts-backed area chart. Kept in its own module so
 * the sibling `trend-chart-client.tsx` can `dynamic()` it with
 * `ssr: false` — recharts sub-modules have first-render side effects
 * that trip the SSR error boundary on Next 16 Turbopack. Only the
 * dashboard imports `TrendChart` (from trend-chart.tsx which re-
 * exports the client wrapper).
 */

const TONE_HEX: Record<StatusTone, { stroke: string }> = {
  success: { stroke: 'oklch(0.58 0.14 145)' },
  info: { stroke: 'oklch(0.55 0.13 240)' },
  warning: { stroke: 'oklch(0.66 0.15 70)' },
  danger: { stroke: 'oklch(0.577 0.245 27.325)' },
  neutral: { stroke: 'oklch(0.5 0.008 60)' },
};

export function TrendChartInner({
  title,
  iconEl,
  data,
  tone = 'info',
  href,
}: {
  title: string;
  /** Pre-rendered icon element. The server renders it so the icon
   *  never crosses the RSC boundary as a component reference. */
  iconEl: ReactNode;
  data: TrendPoint[];
  tone?: StatusTone;
  href?: string;
}) {
  const total = data.reduce((sum, p) => sum + p.count, 0);
  // Split window in half and compare — good enough for a directional
  // trend indicator on a 30d rolling window without needing a second
  // 30d window pulled from the DB.
  const half = Math.floor(data.length / 2);
  const firstHalf = data.slice(0, half).reduce((s, p) => s + p.count, 0);
  const secondHalf = data.slice(half).reduce((s, p) => s + p.count, 0);
  const delta = secondHalf - firstHalf;
  const deltaPct = firstHalf === 0 ? 0 : Math.round((delta / firstHalf) * 100);

  const c = TONE_HEX[tone];

  const inner = (
    <div className="rounded-lg border bg-card p-4 transition-colors hover:border-foreground/20">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex size-6 items-center justify-center rounded-md bg-muted/50 text-muted-foreground [&_svg]:size-3.5">
            {iconEl}
          </div>
          <span className="text-sm font-medium">{title}</span>
        </div>
        <div className="text-right">
          <div className="text-xl font-semibold leading-none tabular-nums">{total}</div>
          <div
            className={cn(
              'mt-1 text-[10px] uppercase tracking-wider',
              deltaPct > 0 && 'text-status-success',
              deltaPct < 0 && 'text-status-danger',
              deltaPct === 0 && 'text-muted-foreground',
            )}
          >
            {deltaPct > 0 && '▲'} {deltaPct < 0 && '▼'}{' '}
            {deltaPct === 0 ? 'flat' : `${Math.abs(deltaPct)}%`} vs prior 15d
          </div>
        </div>
      </div>
      <div className="h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id={`trend-${title}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={c.stroke} stopOpacity={0.35} />
                <stop offset="100%" stopColor={c.stroke} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeOpacity={0.12} vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(v: string) => format(parseISO(v), 'd MMM')}
              tick={{ fontSize: 10, fill: 'oklch(0.51 0.012 60)' }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={40}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 10, fill: 'oklch(0.51 0.012 60)' }}
              tickLine={false}
              axisLine={false}
              width={28}
            />
            <Tooltip
              cursor={{ stroke: c.stroke, strokeOpacity: 0.35 }}
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
              formatter={(value) => [String(value ?? 0), title]}
            />
            <Area
              type="monotone"
              dataKey="count"
              stroke={c.stroke}
              strokeWidth={2}
              fill={`url(#trend-${title})`}
              fillOpacity={1}
              isAnimationActive
              animationDuration={600}
              animationEasing="ease-out"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );

  if (!href) return inner;
  return (
    <a href={href} className="block">
      {inner}
    </a>
  );
}

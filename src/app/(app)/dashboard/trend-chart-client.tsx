'use client';

import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';
import type { StatusTone } from '@/components/ui/status-dot';
import type { TrendPoint } from '@/modules/dashboard/trends';

// Recharts is client-only. `next/dynamic` with `ssr: false` skips the
// server render entirely so recharts modules never load on the server.
const TrendChartInner = dynamic(
  () => import('./trend-chart-inner').then((m) => ({ default: m.TrendChartInner })),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-lg border bg-card p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="h-4 w-24 rounded bg-muted/60" />
          <div className="h-4 w-8 rounded bg-muted/60" />
        </div>
        <div className="h-40 w-full animate-pulse rounded bg-muted/30" />
      </div>
    ),
  },
);

export function TrendChart(props: {
  title: string;
  iconEl: ReactNode;
  data: TrendPoint[];
  tone?: StatusTone;
  href?: string;
}) {
  return <TrendChartInner {...props} />;
}

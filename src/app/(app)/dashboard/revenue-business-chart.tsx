'use client';

import dynamic from 'next/dynamic';
import type {
  RevenueServiceRow,
  RevenueSource,
  RevenueTrendPoint,
} from '@/modules/dashboard/revenue';

// Recharts is a ~150 KB client-only dependency and the four dashboard
// pages that render these charts don't need it on first paint. Mirror
// the TrendChart pattern — hand recharts to `next/dynamic` with ssr
// disabled so the module is split into its own chunk and only loaded
// once the containing route hydrates.
const RevenueBusinessChartInner = dynamic(
  () =>
    import('./revenue-business-chart-inner').then((m) => ({
      default: m.RevenueBusinessChart,
    })),
  {
    ssr: false,
    loading: () => <ChartSkeleton />,
  },
);

const RevenueBusinessGridInner = dynamic(
  () =>
    import('./revenue-business-chart-inner').then((m) => ({
      default: m.RevenueBusinessGrid,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <ChartSkeleton />
        <ChartSkeleton />
        <ChartSkeleton />
      </div>
    ),
  },
);

function ChartSkeleton() {
  return (
    <div className="glass-panel rounded-lg p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="h-4 w-24 rounded bg-muted/60" />
        <div className="h-4 w-16 rounded bg-muted/60" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-5">
        <div className="h-40 w-full animate-pulse rounded bg-muted/30 sm:col-span-2" />
        <div className="h-44 w-full animate-pulse rounded bg-muted/30 sm:col-span-3" />
      </div>
    </div>
  );
}

export function RevenueBusinessChart(props: {
  source: RevenueSource;
  services: RevenueServiceRow[];
  trend: RevenueTrendPoint[];
  emptyLabel?: string;
}) {
  return <RevenueBusinessChartInner {...props} />;
}

export function RevenueBusinessGrid(props: {
  services: RevenueServiceRow[];
  trend: RevenueTrendPoint[];
}) {
  return <RevenueBusinessGridInner {...props} />;
}

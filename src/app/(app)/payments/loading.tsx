import { PageHeaderSkeleton, TableSkeleton } from '@/components/skeletons';

/**
 * Perf (owner's navigation-lag fix) — dynamic route without a loading
 * boundary gives no feedback until the server responds; this skeleton
 * makes the click register instantly and lets Next.js partially
 * prefetch the route.
 */
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10">
      <PageHeaderSkeleton actionWidth={220} />
      <TableSkeleton rows={8} columnWidths={['30%', '18%', '20%', '18%', '10%', '4%']} />
    </div>
  );
}

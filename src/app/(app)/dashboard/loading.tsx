import { CardWithRowsSkeleton, TileGridSkeleton } from '@/components/skeletons';
import { Skeleton } from '@/components/ui/skeleton';

export default function DashboardLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-10 md:py-10">
      <div className="mb-8 space-y-2">
        <Skeleton className="h-5 w-20 rounded-full" />
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-96" />
      </div>

      <div className="space-y-8">
        <section>
          <Skeleton className="mb-3 h-3 w-32" />
          <TileGridSkeleton count={3} className="xl:grid-cols-3" />
        </section>
        <section>
          <Skeleton className="mb-3 h-3 w-24" />
          <TileGridSkeleton count={4} />
        </section>
        <section>
          <Skeleton className="mb-3 h-3 w-24" />
          <TileGridSkeleton count={2} className="xl:grid-cols-2" />
        </section>
        <section>
          <Skeleton className="mb-3 h-3 w-28" />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <CardWithRowsSkeleton titleWidth={160} />
            <CardWithRowsSkeleton titleWidth={140} />
            <CardWithRowsSkeleton titleWidth={120} />
            <CardWithRowsSkeleton titleWidth={200} />
          </div>
        </section>
      </div>
    </div>
  );
}

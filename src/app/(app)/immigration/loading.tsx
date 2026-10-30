import { PageHeaderSkeleton } from '@/components/skeletons';
import { Skeleton } from '@/components/ui/skeleton';

/** Same shape as the Stage 6G cases list: header, tiles, controls, card grid. */
export default function ImmigrationLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10">
      <PageHeaderSkeleton actionWidth={220} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton tiles have no id
          <Skeleton key={`t-${i}`} className="h-[92px] rounded-2xl" />
        ))}
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <Skeleton className="h-9 w-64 rounded-xl" />
        <Skeleton className="h-9 w-40 rounded-xl" />
      </div>
      <Skeleton className="mt-3 h-[72px] rounded-2xl" />
      <Skeleton className="mt-4 h-10 rounded-xl" />
      <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(min(100%,15.5rem),1fr))] gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton cards have no id
          <Skeleton key={`c-${i}`} className="h-[236px] rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

import { PageHeaderSkeleton } from '@/components/skeletons';
import { Skeleton } from '@/components/ui/skeleton';

/** Same shape as the Stage 6G HR Board: header, tiles, timesheet, directory. */
export default function HrBoardLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10">
      <PageHeaderSkeleton actionWidth={140} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton tiles have no id
          <Skeleton key={`t-${i}`} className="h-[92px] rounded-2xl" />
        ))}
      </div>
      <div className="mt-6 flex flex-wrap items-end justify-between gap-2">
        <Skeleton className="h-6 w-40 rounded-lg" />
        <Skeleton className="h-9 w-64 rounded-xl" />
      </div>
      <Skeleton className="mt-3 h-[360px] rounded-2xl" />
      <Skeleton className="mt-6 h-[220px] rounded-2xl" />
    </div>
  );
}

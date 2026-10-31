import { PageHeaderSkeleton } from '@/components/skeletons';
import { Skeleton } from '@/components/ui/skeleton';

/** Same shape as Stage 6G My team: header, tiles, report list. */
export default function MyTeamLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10">
      <PageHeaderSkeleton actionWidth={140} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton tiles have no id
          <Skeleton key={`t-${i}`} className="h-[92px] rounded-2xl" />
        ))}
      </div>
      <Skeleton className="mt-6 h-[320px] rounded-2xl" />
    </div>
  );
}

import { PageHeaderSkeleton } from '@/components/skeletons';
import { Skeleton } from '@/components/ui/skeleton';

/** Same shape as Stage 6G My attendance: header, clock card, sessions list. */
export default function MyAttendanceLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10">
      <PageHeaderSkeleton actionWidth={120} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Skeleton className="h-[300px] rounded-2xl" />
        <Skeleton className="h-[420px] rounded-2xl lg:col-span-2" />
      </div>
    </div>
  );
}

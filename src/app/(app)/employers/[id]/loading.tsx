import { CardWithRowsSkeleton, PageHeaderSkeleton } from '@/components/skeletons';

export default function EmployerDetailLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8 md:px-10 md:py-10">
      <PageHeaderSkeleton hasBadge actionWidth={400} />
      <div className="space-y-6">
        <CardWithRowsSkeleton titleWidth={100} rowCount={3} />
        <CardWithRowsSkeleton titleWidth={140} rowCount={4} />
      </div>
    </div>
  );
}

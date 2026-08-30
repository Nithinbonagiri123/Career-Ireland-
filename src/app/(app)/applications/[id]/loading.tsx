import { CardWithRowsSkeleton, DetailPageSkeleton } from '@/components/skeletons';

export default function ApplicationDetailLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8 md:px-10 md:py-10">
      <DetailPageSkeleton cardColumns={3} bodyRows={0} />
      <div className="mt-8 space-y-6">
        <CardWithRowsSkeleton titleWidth={140} rowCount={2} />
        <CardWithRowsSkeleton titleWidth={100} rowCount={2} />
      </div>
    </div>
  );
}

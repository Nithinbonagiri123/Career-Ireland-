import { CardWithRowsSkeleton, PageHeaderSkeleton } from '@/components/skeletons';

export default function InterviewsLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8 md:px-10 md:py-10">
      <PageHeaderSkeleton actionWidth={200} />
      <div className="space-y-6">
        <CardWithRowsSkeleton titleWidth={100} rowCount={4} />
        <CardWithRowsSkeleton titleWidth={120} rowCount={3} />
        <CardWithRowsSkeleton titleWidth={140} rowCount={5} />
      </div>
    </div>
  );
}

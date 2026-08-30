import { DetailPageSkeleton } from '@/components/skeletons';

export default function CandidateDetailLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8 md:px-10 md:py-10">
      <DetailPageSkeleton cardColumns={3} bodyRows={5} />
    </div>
  );
}

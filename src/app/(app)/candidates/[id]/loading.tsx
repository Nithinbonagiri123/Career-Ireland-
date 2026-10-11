import { TabbedDetailPageSkeleton } from '@/components/skeletons';

export default function CandidateDetailLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10">
      <TabbedDetailPageSkeleton />
    </div>
  );
}

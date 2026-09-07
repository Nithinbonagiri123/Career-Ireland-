import { TabbedDetailPageSkeleton } from '@/components/skeletons';

export default function CandidateDetailLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8 md:px-10 md:py-10">
      <TabbedDetailPageSkeleton />
    </div>
  );
}

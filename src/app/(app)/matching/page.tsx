import { SearchCheck } from 'lucide-react';
import Link from 'next/link';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { requirePermission } from '@/lib/auth/session';
import { fetchRequisitions } from '@/modules/requisitions/service';
import { WorkflowRequisitionList } from '../_workflow-list/requisition-list';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Matching' };

export default async function MatchingPage() {
  await requirePermission('recruitment', 'matching', 'view');
  const requisitions = await fetchRequisitions();

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={SearchCheck}
          iconTone="purple"
          title="Matching"
          description={
            <>
              Candidate matching runs against a single requisition. Pick a requisition to view its
              matches, or open one from{' '}
              <Link href="/requisitions" className="underline underline-offset-2">
                Requisitions
              </Link>{' '}
              first.
            </>
          }
        />
      </FadeUp>

      <FadeUp delay={0.05}>
        <WorkflowRequisitionList
          requisitions={requisitions}
          emptyTitle="No requisitions to match against"
          emptyDescription="Create a requisition first — matching runs per-requisition and needs one to exist."
        />
      </FadeUp>
    </div>
  );
}

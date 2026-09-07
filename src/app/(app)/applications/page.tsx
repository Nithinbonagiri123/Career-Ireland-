import { ClipboardList } from 'lucide-react';
import Link from 'next/link';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { requireInternalStaff } from '@/lib/auth/session';
import { fetchRequisitions } from '@/modules/requisitions/service';
import { WorkflowRequisitionList } from '../_workflow-list/requisition-list';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Applications · Career Ireland' };

export default async function ApplicationsPage() {
  await requireInternalStaff();
  const requisitions = await fetchRequisitions();

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={ClipboardList}
          title="Applications"
          description={
            <>
              Applications are tracked per requisition. Pick a requisition below to see who's
              applied, or open one from{' '}
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
          emptyTitle="No requisitions to receive applications"
          emptyDescription="Applications live inside a requisition — create one first."
        />
      </FadeUp>
    </div>
  );
}

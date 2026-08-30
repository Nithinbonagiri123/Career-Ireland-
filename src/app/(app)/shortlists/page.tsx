import { ListChecks } from 'lucide-react';
import Link from 'next/link';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { requireRole } from '@/lib/auth/session';
import { fetchRequisitions } from '@/modules/requisitions/service';
import { WorkflowRequisitionList } from '../_workflow-list/requisition-list';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Shortlists · Career Ireland' };

export default async function ShortlistsPage() {
  await requireRole(['ADMIN', 'STAFF']);
  const requisitions = await fetchRequisitions();

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={ListChecks}
          title="Shortlists"
          description={
            <>
              Shortlists are curated per requisition from your matches. Pick a requisition below, or
              open one from{' '}
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
          emptyTitle="No requisitions yet"
          emptyDescription="Shortlists live inside a requisition — create one to start shortlisting candidates."
        />
      </FadeUp>
    </div>
  );
}

import { MessagesSquare } from 'lucide-react';
import { DateRangeFilter } from '@/components/date-range-filter';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { requireInternalStaff } from '@/lib/auth/session';
import { parseDateRangeParams } from '@/lib/date-range';
import { fetchRecentCommunications } from '@/modules/activities/service';
import { fetchEmployers } from '@/modules/employers/service';
import { fetchPersons } from '@/modules/persons/service';
import { CommsTable } from './comms-table';
import { LogCommDialog } from './log-comm-dialog';

export const dynamic = 'force-dynamic';

export default async function CommunicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; from?: string; to?: string }>;
}) {
  await requireInternalStaff();
  const { created, from, to } = await searchParams;
  const createdRange = parseDateRangeParams({ created, from, to });
  const [comms, persons, employers] = await Promise.all([
    fetchRecentCommunications(100, createdRange),
    fetchPersons(),
    fetchEmployers(),
  ]);

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={MessagesSquare}
          title="Communications"
          description="Every recorded touchpoint. Attach to at least one subject so it appears in that record's timeline."
          action={
            <div className="flex flex-wrap items-center gap-2">
              <DateRangeFilter />
              <LogCommDialog persons={persons} employers={employers} />
            </div>
          }
        />
      </FadeUp>
      <FadeUp delay={0.05}>
        <CommsTable comms={comms} />
      </FadeUp>
    </div>
  );
}

import { Trophy } from 'lucide-react';
import { CsvExportButton } from '@/components/csv-export-button';
import { DateRangeFilter } from '@/components/date-range-filter';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { requireInternalStaff } from '@/lib/auth/session';
import { parseDateRangeParams } from '@/lib/date-range';
import { fetchPlacements } from '@/modules/placements/service';
import { PlacementsTable } from './placements-table';

export const dynamic = 'force-dynamic';

export default async function PlacementsPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; from?: string; to?: string }>;
}) {
  await requireInternalStaff();
  const { created, from, to } = await searchParams;
  const createdRange = parseDateRangeParams({ created, from, to });
  const placements = await fetchPlacements(createdRange);

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={Trophy}
          title="Placements"
          description="Successful Candidate ↔ Employer outcomes. Confirming a placement immediately flips candidate availability to PLACED and advances the requisition's fill count."
          action={
            <div className="flex flex-wrap items-center gap-2">
              <DateRangeFilter />
              <CsvExportButton href="/api/export/placements" />
            </div>
          }
        />
      </FadeUp>
      <FadeUp delay={0.05}>
        <PlacementsTable placements={placements} />
      </FadeUp>
    </div>
  );
}

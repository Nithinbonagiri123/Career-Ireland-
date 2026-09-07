import { Trophy } from 'lucide-react';
import { CsvExportButton } from '@/components/csv-export-button';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { requireInternalStaff } from '@/lib/auth/session';
import { fetchPlacements } from '@/modules/placements/service';
import { PlacementsTable } from './placements-table';

export const dynamic = 'force-dynamic';

export default async function PlacementsPage() {
  await requireInternalStaff();
  const placements = await fetchPlacements();

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={Trophy}
          title="Placements"
          description="Successful Candidate ↔ Employer outcomes. Confirming a placement immediately flips candidate availability to PLACED and advances the requisition's fill count."
          action={<CsvExportButton href="/api/export/placements" />}
        />
      </FadeUp>
      <FadeUp delay={0.05}>
        <PlacementsTable placements={placements} />
      </FadeUp>
    </div>
  );
}

import { Users } from 'lucide-react';
import { CsvExportButton } from '@/components/csv-export-button';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { requireRole } from '@/lib/auth/session';
import { fetchCandidates } from '@/modules/candidates/service';
import { CandidatesTable } from './candidates-table';

export const dynamic = 'force-dynamic';

export default async function CandidatesPage() {
  await requireRole(['ADMIN', 'STAFF']);
  const candidates = await fetchCandidates();

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={Users}
          title="Candidates"
          description="Career Ireland's active talent pool. Shared across Candidate Services and Recruitment — each person is a single record. Click any row for the full timeline."
          action={<CsvExportButton href="/api/export/candidates" />}
        />
      </FadeUp>
      <FadeUp delay={0.05}>
        <CandidatesTable candidates={candidates} />
      </FadeUp>
    </div>
  );
}

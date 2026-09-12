import { Plus, Users } from 'lucide-react';
import Link from 'next/link';
import { CsvExportButton } from '@/components/csv-export-button';
import { DateRangeFilter } from '@/components/date-range-filter';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { ScopeFilter } from '@/components/scope-filter';
import { buttonVariants } from '@/components/ui/button';
import { requireInternalStaff } from '@/lib/auth/session';
import { parseDateRangeParams } from '@/lib/date-range';
import { parseAssignmentScope } from '@/lib/scope';
import { fetchCandidates } from '@/modules/candidates/service';
import { fetchStaffUserOptions } from '@/modules/users/service';
import { CandidatesTable } from './candidates-table';

export const dynamic = 'force-dynamic';

export default async function CandidatesPage({
  searchParams,
}: {
  searchParams: Promise<{ assigned?: string; created?: string; from?: string; to?: string }>;
}) {
  await requireInternalStaff();
  const { assigned, created, from, to } = await searchParams;
  const scope = parseAssignmentScope(assigned);
  const createdRange = parseDateRangeParams({ created, from, to });
  const [candidates, staffUsers] = await Promise.all([
    fetchCandidates(scope, createdRange),
    fetchStaffUserOptions(),
  ]);

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={Users}
          title="Candidates"
          description="Ireland Career Gateway's active talent pool. Shared across Candidate Services and Recruitment — each person is a single record. Click any row for the full timeline."
          action={
            <div className="flex flex-wrap items-center gap-2">
              <DateRangeFilter />
              <ScopeFilter current={scope} />
              <CsvExportButton href="/api/export/candidates" />
              <Link href="/candidates/new" className={buttonVariants({ size: 'default' })}>
                <Plus className="mr-1.5 size-4" />
                Add candidate
              </Link>
            </div>
          }
        />
      </FadeUp>
      <FadeUp delay={0.05}>
        <CandidatesTable
          candidates={candidates}
          staffUsers={staffUsers.map((u) => ({
            id: u.id,
            fullName: u.fullName,
            email: u.email,
          }))}
        />
      </FadeUp>
    </div>
  );
}

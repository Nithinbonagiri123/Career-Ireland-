import { Building2, Plus } from 'lucide-react';
import { CsvExportButton } from '@/components/csv-export-button';
import { DateRangeFilter } from '@/components/date-range-filter';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { ScopeFilter } from '@/components/scope-filter';
import { Button } from '@/components/ui/button';
import { requireInternalStaff } from '@/lib/auth/session';
import { parseDateRangeParams } from '@/lib/date-range';
import { parseAssignmentScope } from '@/lib/scope';
import { fetchEmployers } from '@/modules/employers/service';
import { EmployerDialog } from './employer-dialog';
import { EmployersTable } from './employers-table';

export const dynamic = 'force-dynamic';

export default async function EmployersPage({
  searchParams,
}: {
  searchParams: Promise<{ assigned?: string; created?: string; from?: string; to?: string }>;
}) {
  await requireInternalStaff();
  const { assigned, created, from, to } = await searchParams;
  const scope = parseAssignmentScope(assigned);
  const createdRange = parseDateRangeParams({ created, from, to });
  const employers = await fetchEmployers(scope, createdRange);

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={Building2}
          title="Employers"
          description="Irish employers Ireland Career Gateway recruits for. Each employer has multiple contacts and can raise multiple Job Requisitions."
          action={
            <div className="flex flex-wrap items-center gap-2">
              <DateRangeFilter />
              <ScopeFilter current={scope} />
              <CsvExportButton href="/api/export/employers" />
              <EmployerDialog
                trigger={
                  <Button size="sm">
                    <Plus className="mr-1.5 size-4" /> New employer
                  </Button>
                }
              />
            </div>
          }
        />
      </FadeUp>
      <FadeUp delay={0.05}>
        <EmployersTable employers={employers} />
      </FadeUp>
    </div>
  );
}

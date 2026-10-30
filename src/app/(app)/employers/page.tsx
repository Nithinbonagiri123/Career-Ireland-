import { Building2, Plus } from 'lucide-react';
import { CsvExportButton } from '@/components/csv-export-button';
import { DateRangeFilter } from '@/components/date-range-filter';
import { EmptyMineNudge } from '@/components/empty-mine-nudge';
import { ListSummaryStrip, type SummaryChip } from '@/components/list-summary-strip';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { ScopeFilter } from '@/components/scope-filter';
import { Button } from '@/components/ui/button';
import { checkPermission, requireInternalStaff, requirePermission } from '@/lib/auth/session';
import { parseDateRangeParams } from '@/lib/date-range';
import { parseAssignmentScope } from '@/lib/scope';
import { fetchEmployers } from '@/modules/employers/service';
import { fetchAppSettings } from '@/modules/settings/service';
import { fetchStaffUserOptions } from '@/modules/users/service';
import { EmployerDialog } from './employer-dialog';
import { EmployersTable } from './employers-table';

export const dynamic = 'force-dynamic';

export default async function EmployersPage({
  searchParams,
}: {
  searchParams: Promise<{ assigned?: string; created?: string; from?: string; to?: string }>;
}) {
  await requirePermission('recruitment', 'employers', 'view');
  const session = await requireInternalStaff();
  // R6 — controls follow recruitment.employers (server actions re-check).
  const [canCreateEmployer, canEditEmployer] = await Promise.all([
    checkPermission('recruitment', 'employers', 'create'),
    checkPermission('recruitment', 'employers', 'edit'),
  ]);
  const { assigned, created, from, to } = await searchParams;
  const scope = parseAssignmentScope(assigned);
  const createdRange = parseDateRangeParams({ created, from, to });
  const [employers, settings, staffUsers] = await Promise.all([
    fetchEmployers(scope, createdRange),
    fetchAppSettings(),
    // Session 31 — small lookup so EmployersTable can render owner
    // avatars inline without fanning out a per-row user query.
    fetchStaffUserOptions(),
  ]);
  const owners = staffUsers.map((u) => ({ id: u.id, fullName: u.fullName }));

  const mineCount = employers.filter((e) => e.assignedUserId === session.user.id).length;
  const unassignedCount = employers.filter((e) => e.assignedUserId === null).length;
  const summaryChips: SummaryChip[] = [
    { label: 'mine', value: mineCount, tone: 'info' },
    { label: 'unassigned', value: unassignedCount, tone: 'warning' },
  ];
  // Session 35 — see candidates/page.tsx; `mine` is the default so only
  // non-default scopes earn a chip.
  const activeFilters =
    scope === 'all'
      ? [{ label: 'scope: everyone' }]
      : scope === 'unassigned'
        ? [{ label: 'scope: unassigned' }]
        : [];

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={Building2}
          iconTone="neutral"
          title="Employers"
          description={`Employers ${settings.legalName} recruits for. Each employer has multiple contacts and can raise multiple Job Requisitions.`}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <DateRangeFilter />
              <ScopeFilter current={scope} />
              <CsvExportButton href="/api/export/employers" />
              {canCreateEmployer && (
                <EmployerDialog
                  appVatRegistered={settings.vatRegistered}
                  trigger={
                    <Button size="sm">
                      <Plus className="mr-1.5 size-4" /> New employer
                    </Button>
                  }
                />
              )}
            </div>
          }
        />
      </FadeUp>
      <FadeUp delay={0.05}>
        <ListSummaryStrip
          total={employers.length}
          totalLabel="employers"
          chips={summaryChips}
          filters={activeFilters}
        />
      </FadeUp>
      {scope === 'mine' && employers.length === 0 && (
        <FadeUp delay={0.06}>
          <EmptyMineNudge resourceLabel="employers" seeAllHref="/employers?assigned=all" />
        </FadeUp>
      )}
      <FadeUp delay={0.08}>
        <EmployersTable
          employers={employers}
          appVatRegistered={settings.vatRegistered}
          owners={owners}
          canEdit={canEditEmployer}
        />
      </FadeUp>
    </div>
  );
}

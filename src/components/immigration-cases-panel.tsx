import { CheckCircle2, Clock, PlaneTakeoff, PlusCircle, XCircle } from 'lucide-react';
import Link from 'next/link';
import { EmptyState } from '@/components/empty-state';
import { Timestamp } from '@/components/timestamp';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { CaseListRow } from '@/modules/immigration/service';

/**
 * Read-only summary of a person's non-archived immigration cases —
 * lands on the candidate profile so a CS operator can see every permit
 * / visa in-flight for this candidate, and click through to work on any.
 *
 * The "Raise immigration case" trigger is intentionally NOT rendered
 * here — that lives in the profile header where the primary actions
 * sit. This panel is the shortcut *back into* the immigration module
 * once a case exists.
 */
const STATUS_ICON = {
  OPEN: PlusCircle,
  IN_PROGRESS: Clock,
  SUBMITTED: Clock,
  APPROVED: CheckCircle2,
  REJECTED: XCircle,
  WITHDRAWN: XCircle,
  EXPIRED: XCircle,
} as const;

const STATUS_TONE: Record<keyof typeof STATUS_ICON, string> = {
  OPEN: 'bg-status-info-soft text-status-info',
  IN_PROGRESS: 'bg-status-info-soft text-status-info',
  SUBMITTED: 'bg-status-info-soft text-status-info',
  APPROVED: 'bg-status-success-soft text-status-success',
  REJECTED: 'bg-status-danger-soft text-status-danger',
  WITHDRAWN: 'bg-muted text-muted-foreground',
  EXPIRED: 'bg-status-warning-soft text-status-warning',
};

const CASE_TYPE_LABEL: Record<'EMPLOYMENT_PERMIT' | 'VISA' | 'VISA_EXTENSION', string> = {
  EMPLOYMENT_PERMIT: 'Employment permit',
  VISA: 'Visa',
  VISA_EXTENSION: 'Visa extension',
};

export function ImmigrationCasesPanel({ cases }: { cases: CaseListRow[] }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <PlaneTakeoff className="size-4 text-muted-foreground" />
            Immigration cases
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Every non-archived permit, visa, or extension where this candidate is the beneficiary.
            Use "Raise immigration case" in the profile header to open a new one.
          </p>
        </div>
      </CardHeader>
      <CardContent>
        {cases.length === 0 ? (
          <EmptyState
            icon={PlaneTakeoff}
            title="No immigration cases"
            description="Once you raise one, it'll show up here with the current status and expiry."
          />
        ) : (
          <ul className="divide-y">
            {cases.map((c) => {
              const Icon = STATUS_ICON[c.status as keyof typeof STATUS_ICON] ?? Clock;
              const tone = STATUS_TONE[c.status as keyof typeof STATUS_TONE] ?? STATUS_TONE.OPEN;
              return (
                <li key={c.id}>
                  <Link
                    href={`/immigration/${c.id}`}
                    className="-mx-4 flex items-center gap-3 px-4 py-2 transition-colors hover:bg-muted/50"
                  >
                    <span
                      className={cn('grid size-8 shrink-0 place-items-center rounded-full', tone)}
                    >
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {c.applicationTypeName ?? CASE_TYPE_LABEL[c.caseType]}
                        {c.sponsorName ? (
                          <span className="text-muted-foreground"> · {c.sponsorName}</span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                        <span className="uppercase tracking-wide">
                          {c.status.replace(/_/g, ' ').toLowerCase()}
                        </span>
                        {c.ownerName && <span>· owner {c.ownerName}</span>}
                        {c.authorityReference && <span>· ref {c.authorityReference}</span>}
                      </p>
                    </div>
                    <div className="hidden shrink-0 text-right sm:block">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Opened
                      </p>
                      <Timestamp date={c.createdAt} absoluteOnly />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

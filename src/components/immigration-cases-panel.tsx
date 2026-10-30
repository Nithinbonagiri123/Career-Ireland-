import { format } from 'date-fns';
import { ChevronRight, PlaneTakeoff } from 'lucide-react';
import Link from 'next/link';
import { DsStatusPill } from '@/components/ds/status-pill';
import type { DsTone } from '@/components/ds/tones';
import { DS_ROW_LIST, SectionCard } from '@/components/ds/workspace';
import type { ImmigrationCase } from '@/lib/db/schema/immigration';
import { CASE_STAGE_LABEL, CASE_TYPE_LABEL } from '@/modules/immigration/labels';
import type { CaseListRow } from '@/modules/immigration/service';

/** Stage colour per case status (same mapping as the Immigration cases list). */
const STATUS_TONE: Record<ImmigrationCase['status'], DsTone> = {
  OPEN: 'blue',
  DOCUMENTS_PENDING: 'amber',
  SUBMITTED: 'violet',
  UNDER_AUTHORITY_REVIEW: 'violet',
  APPROVED: 'green',
  REJECTED: 'rose',
  CLOSED: 'slate',
};

/**
 * Stage 6G — immigration cases this employer sponsors, on the Employer
 * workspace. Read-only: each row opens the case. The rows passed in are
 * unchanged (same query and visibility as before); only the look changed.
 */
export function ImmigrationCasesPanel({ cases }: { cases: CaseListRow[] }) {
  return (
    <SectionCard
      icon={PlaneTakeoff}
      title="Immigration cases"
      count={cases.length}
      description="Permits, visas and extensions this employer sponsors."
      testId="employer-immigration-panel"
    >
      {cases.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No immigration cases are sponsored by this employer.
        </p>
      ) : (
        <ul className={DS_ROW_LIST}>
          {cases.map((c) => (
            <li key={c.id}>
              <Link
                href={`/immigration/${c.id}`}
                aria-label={`Open case for ${c.beneficiaryName}`}
                // Inset ring: the row list clips overflow, so an offset ring would hide.
                className="flex items-center gap-3 px-4 py-3 outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="truncate text-sm font-semibold text-foreground">
                      {c.beneficiaryName}
                    </span>
                    <DsStatusPill tone={STATUS_TONE[c.status]}>
                      {CASE_STAGE_LABEL[c.status]}
                    </DsStatusPill>
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    <span>{c.applicationTypeName ?? CASE_TYPE_LABEL[c.caseType]}</span>
                    {c.ownerName && <span>· Owner {c.ownerName}</span>}
                    {c.authorityReference && <span>· Ref {c.authorityReference}</span>}
                    <span>
                      · Opened{' '}
                      <time dateTime={new Date(c.createdAt).toISOString()}>
                        {format(c.createdAt, 'd MMM yyyy · HH:mm')}
                      </time>
                    </span>
                  </p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

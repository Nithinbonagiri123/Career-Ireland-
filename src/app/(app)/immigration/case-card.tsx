'use client';

import { format, formatDistanceToNowStrict } from 'date-fns';
import { Building2, CalendarDays, Filter, Grid3x3, UserCircle2 } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { statusTone } from '@/lib/ui/status-tone';
import { cn } from '@/lib/utils';
import { CASE_STAGE_LABEL, CASE_TYPE_LABEL } from '@/modules/immigration/labels';
import type { CaseListRow } from '@/modules/immigration/service';

/**
 * Owner-forward case card for the immigration Global Cases / My Cases views.
 *
 * The spec (§11) says owner must always be visible and immediately obvious —
 * so the row structure is: candidate name up top, owner badge in the same
 * eyeline. Sponsor + application type get the smaller supporting rail.
 */
export function CaseCard({ case: c }: { case: CaseListRow }) {
  const created = formatDistanceToNowStrict(c.createdAt, { addSuffix: true });
  const createdAbsolute = format(c.createdAt, 'd MMM yyyy · HH:mm');
  return (
    <Link href={`/immigration/${c.id}`} className="block outline-none">
      <Card className="h-full transition-shadow hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring">
        <CardContent className="flex h-full flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <h3 className="truncate text-sm font-semibold leading-tight">{c.beneficiaryName}</h3>
              <p className="truncate text-xs text-muted-foreground">
                {CASE_TYPE_LABEL[c.caseType]}
                {c.applicationTypeName && <span className="ml-1">· {c.applicationTypeName}</span>}
              </p>
            </div>
            <Badge variant={statusTone(c.status)} className="shrink-0 rounded-full text-[10px]">
              {CASE_STAGE_LABEL[c.status]}
            </Badge>
          </div>

          <div className="mt-auto space-y-1.5 text-xs">
            <div className="flex items-center gap-1.5">
              <UserCircle2 className="size-3.5 shrink-0 text-muted-foreground" />
              <span
                className={cn('truncate font-medium', !c.ownerName && 'text-muted-foreground/60')}
              >
                Owner: {c.ownerName ?? 'Unassigned'}
              </span>
            </div>
            {c.sponsorName && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Building2 className="size-3.5 shrink-0" />
                <span className="truncate">Sponsor: {c.sponsorName}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <CalendarDays className="size-3.5 shrink-0" />
              <time dateTime={c.createdAt.toISOString()} title={createdAbsolute}>
                Opened {created}
              </time>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export function CasesCardGrid({ cases }: { cases: CaseListRow[] }) {
  if (cases.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center">
        <p className="text-sm font-medium">No immigration cases yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Employment Permits, Visas, and Visa Extensions will appear here. Click “Open case” above
          to record the first one.
        </p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {cases.map((c) => (
        <CaseCard key={c.id} case={c} />
      ))}
    </div>
  );
}

export function CasesViewToggle({ current }: { current: 'grid' | 'table' }) {
  const isGrid = current === 'grid';
  return (
    <div className="inline-flex overflow-hidden rounded-md border">
      <Link
        href="?view=grid"
        aria-pressed={isGrid}
        className={cn(
          'flex items-center gap-1 px-2.5 py-1 text-xs font-medium transition-colors',
          isGrid
            ? 'bg-foreground text-background'
            : 'bg-transparent text-muted-foreground hover:bg-muted',
        )}
      >
        <Grid3x3 className="size-3" /> Cards
      </Link>
      <Link
        href="?view=table"
        aria-pressed={!isGrid}
        className={cn(
          'flex items-center gap-1 border-l px-2.5 py-1 text-xs font-medium transition-colors',
          !isGrid
            ? 'bg-foreground text-background'
            : 'bg-transparent text-muted-foreground hover:bg-muted',
        )}
      >
        <Filter className="size-3" /> Table
      </Link>
    </div>
  );
}

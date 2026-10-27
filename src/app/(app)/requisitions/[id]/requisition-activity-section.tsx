import { History } from 'lucide-react';
import Link from 'next/link';
import { EmptyState } from '@/components/empty-state';
import { Timestamp } from '@/components/timestamp';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { RequisitionActivityRow } from '@/modules/requisitions/workspace';

/**
 * R2 — audit trail for this job and its related records (applications,
 * placements, matches, shortlist, checklists, work log, communications,
 * invoices). Newest first, full date + time, paged via `?activityPage=`
 * so pages are linkable and the tab stays selected.
 */
export function RequisitionActivitySection({
  requisitionId,
  rows,
  page,
  hasMore,
}: {
  requisitionId: string;
  rows: RequisitionActivityRow[];
  page: number;
  hasMore: boolean;
}) {
  const href = (p: number) =>
    `/requisitions/${requisitionId}?tab=activity${p > 1 ? `&activityPage=${p}` : ''}`;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="size-4 text-muted-foreground" aria-hidden />
          Activity
        </CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">
          Every recorded change to this job and its applications, placements, shortlist, checklists
          and invoices.
        </p>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState
            icon={History}
            title={page > 1 ? 'No more activity' : 'No activity yet'}
            description="Changes to this job will be listed here with who made them and when."
          />
        ) : (
          <ol className="divide-y rounded-md border" data-testid="activity-rows">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground">{r.summary}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {r.actorName ?? 'System'}
                  </p>
                </div>
                <Timestamp date={r.occurredAt} absoluteOnly className="text-[11px]" />
              </li>
            ))}
          </ol>
        )}
        {(page > 1 || hasMore) && (
          <nav className="mt-3 flex items-center justify-between" aria-label="Activity pages">
            {page > 1 ? (
              <Link
                href={href(page - 1)}
                scroll={false}
                className={buttonVariants({ size: 'sm', variant: 'outline' })}
              >
                Newer
              </Link>
            ) : (
              <span />
            )}
            <span className="text-xs text-muted-foreground">Page {page}</span>
            <Link
              href={href(page + 1)}
              scroll={false}
              aria-disabled={!hasMore}
              className={cn(
                buttonVariants({ size: 'sm', variant: 'outline' }),
                !hasMore && 'pointer-events-none opacity-50',
              )}
            >
              Older
            </Link>
          </nav>
        )}
      </CardContent>
    </Card>
  );
}

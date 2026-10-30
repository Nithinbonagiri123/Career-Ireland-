import { History } from 'lucide-react';
import Link from 'next/link';
import { ActivityTimeline, SectionCard } from '@/components/ds/workspace';
import { EmptyState } from '@/components/empty-state';
import { buttonVariants } from '@/components/ui/button';
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
    <SectionCard
      icon={History}
      title="Activity"
      description="Every recorded change to this job and its applications, placements, shortlist, checklists and invoices."
    >
      {rows.length === 0 ? (
        <EmptyState
          icon={History}
          title={page > 1 ? 'No more activity' : 'No activity yet'}
          description="Changes to this job will be listed here with who made them and when."
        />
      ) : (
        <ActivityTimeline
          testId="activity-rows"
          items={rows.map((r) => ({
            id: r.id,
            title: r.summary,
            subtitle: r.actorName ?? 'System',
            at: r.occurredAt,
          }))}
        />
      )}
      {(page > 1 || hasMore) && (
        <nav
          className="mt-4 flex items-center justify-between border-t border-border/60 pt-3"
          aria-label="Activity pages"
        >
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
    </SectionCard>
  );
}

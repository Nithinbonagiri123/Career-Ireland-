import { History } from 'lucide-react';
import Link from 'next/link';
import { ActivityTimeline, SectionCard } from '@/components/ds/workspace';
import { EmptyState } from '@/components/empty-state';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { CampaignActivityRow } from '@/modules/campaigns/prospects';

/** R4 — audit trail for the campaign, its advertisements and its prospects. */
export function CampaignActivitySection({
  campaignId,
  rows,
  page,
  hasMore,
}: {
  campaignId: string;
  rows: CampaignActivityRow[];
  page: number;
  hasMore: boolean;
}) {
  const href = (p: number) =>
    `/campaigns/${campaignId}?tab=activity${p > 1 ? `&activityPage=${p}` : ''}`;
  return (
    <SectionCard
      icon={History}
      title="Activity"
      description="Every recorded change to this campaign, its advertisements and its prospects."
    >
      {rows.length === 0 ? (
        <EmptyState
          icon={History}
          title={page > 1 ? 'No more activity' : 'No activity yet'}
          description="Changes will be listed here with who made them and when."
        />
      ) : (
        <ActivityTimeline
          testId="campaign-activity-rows"
          items={rows.map((r) => ({
            id: r.id,
            title: r.summary,
            subtitle: r.actorName ?? 'System',
            at: r.occurredAt,
          }))}
        />
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
    </SectionCard>
  );
}

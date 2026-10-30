import { format, formatDistanceToNow } from 'date-fns';
import { ArrowRight, CalendarClock, Megaphone, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { CAMPAIGN_DS_TONE } from '@/app/(app)/campaigns/campaign-tones';
import { DsStatusPill } from '@/components/ds/status-pill';
import { EmptyState } from '@/components/empty-state';
import { SectionHeader } from '@/components/section-header';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { CAMPAIGN_STATUS_LABEL } from '@/modules/campaigns/labels';
import type { CampaignListRow } from '@/modules/campaigns/service';

/**
 * Phase 2 blueprint §6.1 — Campaigns summary card.
 *
 * Previously campaigns were only visible under `/campaigns`. Nobody
 * could tell at a glance whether a given client had an ad running or
 * whether a specific requisition had been promoted externally. This
 * panel renders on both employer AND requisition records with the
 * same shape, so operators get consistent commercial context in each
 * place the question comes up.
 *
 * The `scope` prop decides what context the panel is being shown in:
 *   - "employer"    — campaigns can touch multiple requisitions, so
 *                     each row surfaces the requisition title.
 *   - "requisition" — all campaigns here belong to the same
 *                     requisition, so the row drops that column.
 */
export function CampaignsPanel({
  campaigns,
  scope,
  startAdvertisementHref,
}: {
  campaigns: CampaignListRow[];
  scope: 'employer' | 'requisition';
  /** When provided (requisition scope), a quick deep-link to kick off
   *  a new campaign pre-filled with this requisition. */
  startAdvertisementHref?: string;
}) {
  return (
    <Card>
      <SectionHeader
        icon={Megaphone}
        title="Advertising"
        count={campaigns.length}
        action={
          startAdvertisementHref ? (
            <Link
              href={startAdvertisementHref}
              className={cn(buttonVariants({ size: 'sm', variant: 'outline' }))}
            >
              <Sparkles className="mr-1.5 size-4" /> Start a campaign
            </Link>
          ) : null
        }
      >
        Recruitment campaigns tied to {scope === 'employer' ? 'this employer' : 'this requisition'}.
        Each campaign is a container for one or more ads on specific job boards.
      </SectionHeader>
      <CardContent>
        {campaigns.length === 0 ? (
          <EmptyState
            icon={Megaphone}
            title="No campaigns yet"
            description={
              scope === 'employer'
                ? "No ads have been run for this employer's requisitions. Open a requisition and use 'Start advertisement'."
                : 'This requisition hasn\'t been advertised externally. Use the "Start advertisement" header action to kick one off.'
            }
          />
        ) : (
          <ul className="divide-y">
            {campaigns.map((c) => {
              const started = c.startedAt ? format(c.startedAt, 'd MMM yyyy') : null;
              const createdRelative = formatDistanceToNow(c.createdAt, { addSuffix: true });
              return (
                <li key={c.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">{c.name}</p>
                      <DsStatusPill tone={CAMPAIGN_DS_TONE[c.status]}>
                        {CAMPAIGN_STATUS_LABEL[c.status]}
                      </DsStatusPill>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                      {scope === 'employer' && c.requisitionTitle && (
                        <span className="inline-flex items-center gap-1">
                          <span className="opacity-70">For:</span>
                          <span className="text-foreground">{c.requisitionTitle}</span>
                        </span>
                      )}
                      {started && (
                        <span className="inline-flex items-center gap-1 tabular-nums">
                          <CalendarClock className="size-3" aria-hidden />
                          Started {started}
                        </span>
                      )}
                      <span className="tabular-nums opacity-70">Created {createdRelative}</span>
                    </div>
                  </div>
                  <Link
                    href={`/campaigns/${c.id}`}
                    className={cn(buttonVariants({ size: 'sm', variant: 'outline' }))}
                  >
                    Open <ArrowRight className="ml-1 size-3" />
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

import { format, formatDistanceToNowStrict } from 'date-fns';
import { ArrowRight, Briefcase, Building2, CalendarClock, Megaphone, Users } from 'lucide-react';
import Link from 'next/link';
import { CARD_ACTION, CARD_ACTION_TINT, EntityCard } from '@/components/ds/entity-card';
import { DsStatusPill } from '@/components/ds/status-pill';
import { CAMPAIGN_STATUS_LABEL } from '@/modules/campaigns/labels';
import type { CampaignListRow } from '@/modules/campaigns/service';
import { CAMPAIGN_DS_TONE } from './campaign-tones';

/** Stage 6G campaign card (mockup 03 card language applied to a campaign). */
export function CampaignCard({ campaign: c }: { campaign: CampaignListRow }) {
  const tone = CAMPAIGN_DS_TONE[c.status];
  const created = new Date(c.createdAt);
  return (
    <EntityCard
      testId="campaign-card"
      avatar={{ icon: Megaphone, tone }}
      status={
        <span className="flex flex-wrap items-center gap-1">
          <DsStatusPill tone={tone}>{CAMPAIGN_STATUS_LABEL[c.status]}</DsStatusPill>
          {c.archivedAt && <DsStatusPill tone="slate">Archived</DsStatusPill>}
        </span>
      }
      timestamp={
        <time dateTime={created.toISOString()} title={format(created, 'd MMM yyyy · HH:mm')}>
          {formatDistanceToNowStrict(created, { addSuffix: true })}
        </time>
      }
      title={c.name}
      titleHref={`/campaigns/${c.id}`}
      subtitle={c.requisitionTitle ? undefined : 'Talent pool campaign'}
      meta={[
        { key: 'job', icon: Briefcase, content: c.requisitionTitle },
        { key: 'employer', icon: Building2, content: c.employerName },
        {
          key: 'ads',
          icon: Megaphone,
          content:
            c.adCount > 0 ? (
              <>
                {c.activeAdCount} of {c.adCount} advertisements running
              </>
            ) : null,
        },
        {
          key: 'started',
          icon: CalendarClock,
          content: c.startedAt
            ? `Started ${format(new Date(c.startedAt), 'd MMM yyyy · HH:mm')}`
            : null,
        },
        {
          key: 'by',
          icon: Users,
          content: c.createdByName ? `Created by ${c.createdByName}` : null,
        },
      ]}
      stats={[
        { value: c.adCount, label: 'Ads' },
        { value: c.prospectCount, label: 'Prospects' },
        { value: c.convertedCount, label: 'Converted' },
      ]}
      actions={
        <>
          <Link href={`/campaigns/${c.id}`} className={CARD_ACTION}>
            Open
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
          <Link href={`/prospects?campaign=${c.id}`} className={CARD_ACTION_TINT}>
            <Users className="size-3.5" aria-hidden /> Prospects
          </Link>
        </>
      }
    />
  );
}

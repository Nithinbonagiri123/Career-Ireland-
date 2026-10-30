import { format, formatDistanceToNowStrict } from 'date-fns';
import { ArrowRight, CalendarClock, Mail, Megaphone, Sparkles, UserCheck } from 'lucide-react';
import Link from 'next/link';
import { CARD_ACTION, CARD_ACTION_TINT, EntityCard, initialsOf } from '@/components/ds/entity-card';
import { DsStatusPill } from '@/components/ds/status-pill';
import { formatZoned } from '@/lib/zoned-time';
import { PROSPECT_STATUS_LABEL } from '@/modules/campaigns/labels';
import type { ProspectRow } from '@/modules/campaigns/service';
import { PROSPECT_DS_TONE } from '../campaigns/campaign-tones';

/** Stage 6G prospect card (mockup 03 card language applied to a prospect). */
export function ProspectCard({ prospect: p, now }: { prospect: ProspectRow; now: number }) {
  const tone = PROSPECT_DS_TONE[p.status];
  const created = new Date(p.createdAt);
  const due = p.followUpDueAt ? new Date(p.followUpDueAt) : null;
  const overdue = Boolean(due && due.getTime() <= now);
  return (
    <EntityCard
      testId="prospect-card"
      avatar={{ initials: initialsOf(p.personName), tone }}
      status={<DsStatusPill tone={tone}>{PROSPECT_STATUS_LABEL[p.status]}</DsStatusPill>}
      timestamp={
        <time dateTime={created.toISOString()} title={format(created, 'd MMM yyyy · HH:mm')}>
          {formatDistanceToNowStrict(created, { addSuffix: true })}
        </time>
      }
      title={p.personName}
      titleHref={`/prospects/${p.id}`}
      subtitle={p.campaignName}
      meta={[
        { key: 'email', icon: Mail, content: p.personEmail },
        {
          key: 'source',
          icon: Megaphone,
          content: `${p.advertisementCountry}${p.advertisementPlatform ? ` · ${p.advertisementPlatform}` : ''}`,
        },
        {
          key: 'followup',
          icon: CalendarClock,
          content: due ? (
            <span className={overdue ? 'font-medium text-amber-700 dark:text-amber-300' : ''}>
              {overdue ? 'Follow-up due ' : 'Follow-up '}
              {formatZoned(due)}
            </span>
          ) : null,
        },
        {
          key: 'handled',
          icon: UserCheck,
          content: p.screenedByName ? `Handled by ${p.screenedByName}` : null,
        },
      ]}
      actions={
        <>
          <Link href={`/prospects/${p.id}`} className={CARD_ACTION}>
            Open
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
          <Link href={`/campaigns/${p.campaignId}`} className={CARD_ACTION_TINT}>
            <Sparkles className="size-3.5" aria-hidden /> Campaign
          </Link>
        </>
      }
    />
  );
}

import { format, formatDistanceToNowStrict } from 'date-fns';
import { ArrowRight, Briefcase, Factory, Mail, MapPin, User2 } from 'lucide-react';
import Link from 'next/link';
import { CARD_ACTION, CARD_ACTION_TINT, EntityCard, initialsOf } from '@/components/ds/entity-card';
import { DsStatusPill } from '@/components/ds/status-pill';
import type { DsTone } from '@/components/ds/tones';
import type { Employer } from '@/lib/db/schema/recruitment';
import type { EmployerListStats } from '@/modules/employers/service';

/** Employer relationship status → Stage 6G pill tone + label. */
export const EMPLOYER_STATUS: Record<
  Employer['relationshipStatus'],
  { tone: DsTone; label: string }
> = {
  PROSPECT: { tone: 'amber', label: 'Prospect' },
  ACTIVE: { tone: 'green', label: 'Active' },
  ON_HOLD: { tone: 'slate', label: 'On hold' },
  ARCHIVED: { tone: 'slate', label: 'Archived' },
};

/** Stage 6G employer card (mockup 03 card language applied to an employer). */
export function EmployerCard({
  employer: e,
  stats,
  ownerName,
}: {
  employer: Employer;
  stats: EmployerListStats | undefined;
  ownerName: string | null;
}) {
  const status = EMPLOYER_STATUS[e.relationshipStatus];
  const created = new Date(e.createdAt);
  const place = [e.city, e.country].filter(Boolean).join(', ');
  return (
    <EntityCard
      testId="employer-card"
      avatar={{ initials: initialsOf(e.tradingName ?? e.legalName), tone: status.tone }}
      status={<DsStatusPill tone={status.tone}>{status.label}</DsStatusPill>}
      timestamp={
        <time dateTime={created.toISOString()} title={format(created, 'd MMM yyyy · HH:mm')}>
          {formatDistanceToNowStrict(created, { addSuffix: true })}
        </time>
      }
      title={e.legalName}
      titleHref={`/employers/${e.id}`}
      subtitle={e.tradingName ? `t/a ${e.tradingName}` : undefined}
      meta={[
        // Missing details are left out rather than shown as placeholders.
        { key: 'industry', icon: Factory, content: e.industry },
        { key: 'place', icon: MapPin, content: place || null },
        { key: 'email', icon: Mail, content: e.billingEmail },
        {
          key: 'owner',
          icon: User2,
          content: ownerName ?? <span className="text-muted-foreground">Unassigned</span>,
        },
      ]}
      stats={[
        { value: stats?.openJobs ?? 0, label: 'Open jobs' },
        { value: stats?.seatsToFill ?? 0, label: 'Seats to fill' },
        { value: stats?.placements ?? 0, label: 'Placements' },
      ]}
      actions={
        <>
          <Link href={`/employers/${e.id}`} className={CARD_ACTION}>
            Open
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
          <Link href={`/requisitions?employer=${e.id}&assigned=all`} className={CARD_ACTION_TINT}>
            <Briefcase className="size-3.5" aria-hidden /> View jobs
          </Link>
        </>
      }
    />
  );
}

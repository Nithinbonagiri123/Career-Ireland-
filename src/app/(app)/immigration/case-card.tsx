'use client';

import { format, formatDistanceToNowStrict } from 'date-fns';
import {
  ArrowRight,
  Building2,
  CalendarClock,
  FileText,
  Hash,
  User2,
  UserRound,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  CARD_ACTION,
  CARD_ACTION_TINT,
  EntityCard,
  EntityCardGrid,
  initialsOf,
} from '@/components/ds/entity-card';
import { DsStatusPill } from '@/components/ds/status-pill';
import { CASE_STAGE_LABEL, CASE_TYPE_LABEL } from '@/modules/immigration/labels';
import type { CaseListRow } from '@/modules/immigration/service';
import { CASE_STATUS_TONE } from './case-filters';

/**
 * Stage 6G case card (shared EntityCard). Owner stays visible on every card
 * (workflow spec §11); missing details are left out rather than shown as
 * placeholders.
 */
export function CaseCard({ case: c }: { case: CaseListRow }) {
  const tone = CASE_STATUS_TONE[c.status];
  const opened = new Date(c.createdAt);
  return (
    <EntityCard
      testId="immigration-case-card"
      ariaLabel={`Case for ${c.beneficiaryName}`}
      avatar={{ initials: initialsOf(c.beneficiaryName), tone }}
      status={<DsStatusPill tone={tone}>{CASE_STAGE_LABEL[c.status]}</DsStatusPill>}
      timestamp={
        <time dateTime={opened.toISOString()} title={format(opened, 'd MMM yyyy · HH:mm')}>
          <RelativeTime date={opened} />
        </time>
      }
      title={c.beneficiaryName}
      titleHref={`/immigration/${c.id}`}
      subtitle={
        c.applicationTypeName
          ? `${CASE_TYPE_LABEL[c.caseType]} · ${c.applicationTypeName}`
          : CASE_TYPE_LABEL[c.caseType]
      }
      meta={[
        {
          key: 'owner',
          icon: UserRound,
          content: c.ownerName ? (
            <>
              Owner <span className="font-medium text-foreground">{c.ownerName}</span>
            </>
          ) : (
            <span className="text-muted-foreground">Unassigned</span>
          ),
        },
        {
          key: 'sponsor',
          icon: Building2,
          content: c.sponsorName ? `Sponsor: ${c.sponsorName}` : null,
        },
        {
          key: 'reference',
          icon: Hash,
          content: c.authorityReference ? `Ref ${c.authorityReference}` : null,
        },
        {
          key: 'expires',
          icon: CalendarClock,
          content: c.expiresOn ? `Expires ${format(new Date(c.expiresOn), 'd MMM yyyy')}` : null,
        },
      ]}
      actions={
        <>
          <Link href={`/immigration/${c.id}`} className={CARD_ACTION}>
            <FileText className="size-3.5" aria-hidden /> View case
          </Link>
          <Link href={`/candidates/${c.beneficiaryPersonId}`} className={CARD_ACTION_TINT}>
            <User2 className="size-3.5" aria-hidden /> Profile
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </>
      }
    />
  );
}

/**
 * "13 days ago" computed after mount so server and browser render the same
 * text first (avoids a hydration mismatch when the clocks straddle a unit).
 */
function RelativeTime({ date }: { date: Date }) {
  const ms = date.getTime();
  const [label, setLabel] = useState(() => format(ms, 'd MMM yyyy'));
  useEffect(() => {
    setLabel(formatDistanceToNowStrict(ms, { addSuffix: true }));
  }, [ms]);
  return <>{label}</>;
}

export function CasesCardGrid({ cases }: { cases: CaseListRow[] }) {
  return (
    <EntityCardGrid>
      {cases.map((c) => (
        <CaseCard key={c.id} case={c} />
      ))}
    </EntityCardGrid>
  );
}

'use client';

import { differenceInMinutes, format } from 'date-fns';
import { ClipboardList, Mail, MapPin, MoreVertical, Phone, User2 } from 'lucide-react';
import Link from 'next/link';
import {
  CARD_ACTION,
  CARD_ACTION_TINT,
  EntityCard,
  EntityCardGrid,
  initialsOf,
} from '@/components/ds/entity-card';
import { DsStatusPill } from '@/components/ds/status-pill';
import { OwnerAvatar } from '@/components/owner-avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { flagEmojiFromCountryName, flagEmojiFromNationality } from '@/lib/iso-countries';
import { cn } from '@/lib/utils';
import type { CandidateListRow } from '@/modules/candidates/repository';
import { candidateStatus } from './candidate-filters';

/**
 * Stage 6G candidate card (approved mockup 03) on the shared EntityCard:
 * initials, status pill, added-ago + menu, name and profession, contact
 * rows (missing values are left out), owner, the Applications /
 * Shortlists / Placed strip, and Open profile + Reach out.
 */
export function CandidateCard({ candidate: c }: { candidate: CandidateListRow }) {
  const status = candidateStatus(c);
  const activated = new Date(c.activatedAt);
  const location = [c.currentCity, c.currentCountry].filter(Boolean).join(', ');
  const flag = flagEmojiFromNationality(c.nationality) || flagEmojiFromCountryName(c.nationality);

  return (
    <EntityCard
      ariaLabel={`Candidate ${c.fullName}`}
      avatar={{ initials: initialsOf(c.fullName), tone: 'blue' }}
      status={<DsStatusPill tone={status.tone}>{status.label}</DsStatusPill>}
      timestamp={
        // Relative time drifts between server render and hydration — the
        // datetime attribute and the absolute tooltip stay exact.
        <time
          suppressHydrationWarning
          dateTime={activated.toISOString()}
          title={format(activated, 'd MMM yyyy · HH:mm')}
        >
          {compactAgo(activated)}
        </time>
      }
      menu={
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`More actions for ${c.fullName}`}
            className="grid size-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <MoreVertical className="size-4" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              render={
                <Link href={`/clients/${c.personId}?tab=applications`}>
                  <ClipboardList className="mr-1.5 size-4" aria-hidden />
                  Open applications
                </Link>
              }
            />
          </DropdownMenuContent>
        </DropdownMenu>
      }
      title={c.fullName}
      subtitle={
        // The one placeholder kept on purpose: profession is the card's
        // subtitle and "No profession set" tells staff what to fill in.
        c.primaryOccupationName ?? <span className="italic">No profession set</span>
      }
      meta={[
        { key: 'location', icon: MapPin, content: location || null },
        { key: 'phone', icon: Phone, content: c.phone },
        { key: 'email', icon: Mail, content: c.email },
        {
          key: 'nationality',
          icon: User2,
          content: c.nationality ? (
            <span className="inline-flex items-center gap-1.5">
              {flag && (
                <span aria-hidden className="text-sm leading-none">
                  {flag}
                </span>
              )}
              {c.nationality}
            </span>
          ) : null,
        },
        {
          key: 'owner',
          icon: User2,
          content:
            c.assignedUserId && c.assignedUserName ? (
              <OwnerAvatar
                user={{ id: c.assignedUserId, fullName: c.assignedUserName }}
                size="sm"
                showName
              />
            ) : (
              <span className="text-muted-foreground">Unassigned</span>
            ),
        },
      ]}
      stats={[
        { value: c.applicationsCount, label: 'Applications' },
        { value: c.shortlistsCount, label: 'Shortlists' },
        { value: c.placementsCount, label: 'Placed' },
      ]}
      actions={
        <>
          <Link
            href={`/clients/${c.personId}`}
            className={CARD_ACTION}
            aria-label={`Open profile for ${c.fullName}`}
          >
            <User2 className="size-3.5" aria-hidden /> Open profile
          </Link>
          {c.email ? (
            <a
              href={`mailto:${c.email}`}
              className={CARD_ACTION_TINT}
              aria-label={`Reach out to ${c.fullName}`}
            >
              <Mail className="size-3.5" aria-hidden /> Reach out
            </a>
          ) : (
            <span
              className={cn(CARD_ACTION, 'cursor-not-allowed text-muted-foreground opacity-70')}
              title="No email on file"
            >
              <Mail className="size-3.5" aria-hidden /> Reach out
            </span>
          )}
        </>
      }
    />
  );
}

/** "5m ago" / "3h ago" / "4d ago" / "12 Oct" — fits beside the status pill. */
function compactAgo(date: Date): string {
  const mins = Math.max(0, differenceInMinutes(new Date(), date));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 24) return `${Math.floor(mins / 60)}h ago`;
  if (mins < 60 * 24 * 30) return `${Math.floor(mins / (60 * 24))}d ago`;
  return format(date, 'd MMM yyyy');
}

export function CandidatesCardGrid({ candidates }: { candidates: CandidateListRow[] }) {
  return (
    <EntityCardGrid>
      {candidates.map((c) => (
        <CandidateCard key={c.candidateProfileId} candidate={c} />
      ))}
    </EntityCardGrid>
  );
}

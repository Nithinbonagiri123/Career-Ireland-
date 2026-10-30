'use client';

import { Globe, Mail, Phone, UserRound } from 'lucide-react';
import type { ReactNode } from 'react';
import { EntityCard } from '@/components/ds/entity-card';
import { DsEnumPill } from '@/components/ds/status-pill';
import type { DsTone } from '@/components/ds/tones';
import { Timestamp } from '@/components/timestamp';
import { findCountryByName, ISO_COUNTRIES } from '@/lib/iso-countries';
import type { LeadListRow } from '@/modules/leads/repository';

const BUSINESS_LABEL: Record<LeadListRow['targetBusiness'], string> = {
  CANDIDATE_SERVICES: 'Candidate Services lead',
  RECRUITMENT: 'Recruitment lead',
  IMMIGRATION: 'Immigration lead',
};

/** Avatar tone follows the lead's progress (new → converted). */
const STATUS_AVATAR_TONE: Record<LeadListRow['status'], DsTone> = {
  NEW: 'violet',
  CONTACTED: 'teal',
  AWAITING_PAYMENT: 'amber',
  CONVERTED: 'green',
  LOST: 'slate',
  REJECTED: 'rose',
  EXPIRED: 'slate',
};

/** Where a lead's name links to: the client workspace, or the employer. */
export function leadHref(lead: LeadListRow): string {
  if (lead.personId) return `/clients/${lead.personId}`;
  if (lead.employerId) return `/employers/${lead.employerId}`;
  return '/leads';
}

export function leadInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return (parts[0]?.[0] ?? '?').toUpperCase();
  return `${parts[0]?.[0] ?? ''}${parts[parts.length - 1]?.[0] ?? ''}`.toUpperCase();
}

/**
 * Flag emoji for a nationality OR country string. First tries ISO
 * country name ("South Africa"), then reverse-matches the demonym
 * ("South African"). Returns an empty string when neither matches.
 */
export function flagEmojiFromCountryName(input: string): string {
  const direct = findCountryByName(input);
  const country =
    direct ?? ISO_COUNTRIES.find((c) => c.nationality.toLowerCase() === input.toLowerCase());
  if (!country) return '';
  const A = 0x1f1e6;
  const codePoints = country.code
    .toUpperCase()
    .split('')
    .map((ch) => A + (ch.charCodeAt(0) - 'A'.charCodeAt(0)));
  return String.fromCodePoint(...codePoints);
}

/**
 * Stage 6G lead card (mockup 03 card language applied to a lead). Shows
 * the same data and the same actions as the table row; missing contact
 * details are left out rather than shown as placeholders.
 */
export function LeadCard({
  lead,
  statusExtras,
  actions,
}: {
  lead: LeadListRow;
  /** "Ready to convert" / "Will expire" chips — shared with the table. */
  statusExtras?: ReactNode;
  /** The row's own action buttons — shared with the table. */
  actions: ReactNode;
}) {
  const nationality = lead.personNationality ?? lead.personCountry;
  const flag = nationality ? flagEmojiFromCountryName(nationality) : '';
  return (
    <EntityCard
      testId="lead-card"
      ariaLabel={`Lead ${lead.displayName}`}
      avatar={{ initials: leadInitials(lead.displayName), tone: STATUS_AVATAR_TONE[lead.status] }}
      status={<DsEnumPill status={lead.status} />}
      timestamp={<Timestamp date={lead.createdAt} absoluteOnly className="text-[11px]" />}
      title={lead.displayName}
      titleHref={leadHref(lead)}
      subtitle={BUSINESS_LABEL[lead.targetBusiness]}
      meta={[
        { key: 'phone', icon: Phone, content: lead.personPhone },
        { key: 'email', icon: Mail, content: lead.personEmail },
        {
          key: 'nationality',
          icon: Globe,
          content: nationality ? (
            <span className="inline-flex items-center gap-1.5">
              {flag && <span aria-hidden>{flag}</span>}
              {nationality}
            </span>
          ) : null,
        },
        {
          key: 'owner',
          icon: UserRound,
          content: lead.assignedUserName ?? (
            <span className="text-muted-foreground">Unassigned</span>
          ),
        },
      ]}
      actions={
        <div className="col-span-2 space-y-2">
          {statusExtras && <div className="flex flex-wrap gap-1.5">{statusExtras}</div>}
          <div className="flex flex-wrap items-center gap-2 [&>*]:min-w-0">{actions}</div>
        </div>
      }
    />
  );
}

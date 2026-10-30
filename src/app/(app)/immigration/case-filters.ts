import { readMulti } from '@/components/ds/params';
import type { DsTone } from '@/components/ds/tones';
import type { ImmigrationCase } from '@/lib/db/schema/immigration';
import type { CaseListRow } from '@/modules/immigration/service';

/**
 * One place for the Immigration Cases list's filter / sort rules so the card
 * grid, the table and the tab counts always agree. Pure functions — safe on
 * the server.
 */

/** Stage tabs (URL `stage`), grouped like CASE_STAGE_LABEL. */
export const STAGE_TABS = [
  { key: 'all', label: 'All', statuses: null },
  { key: 'new', label: 'New candidate', tone: 'blue', statuses: ['OPEN'] },
  {
    key: 'documents',
    label: 'Document collection',
    tone: 'amber',
    statuses: ['DOCUMENTS_PENDING'],
  },
  {
    key: 'in_progress',
    label: 'Application in progress',
    tone: 'violet',
    statuses: ['SUBMITTED', 'UNDER_AUTHORITY_REVIEW'],
  },
  { key: 'approved', label: 'Approved', tone: 'green', statuses: ['APPROVED'] },
  { key: 'rejected', label: 'Rejected', tone: 'rose', statuses: ['REJECTED'] },
  { key: 'closed', label: 'Closed', tone: 'slate', statuses: ['CLOSED'] },
] as const satisfies ReadonlyArray<{
  key: string;
  label: string;
  tone?: DsTone;
  statuses: ReadonlyArray<ImmigrationCase['status']> | null;
}>;

export type StageKey = (typeof STAGE_TABS)[number]['key'];

/** Pill tone per case status (stage colour). */
export const CASE_STATUS_TONE: Record<ImmigrationCase['status'], DsTone> = {
  OPEN: 'blue',
  DOCUMENTS_PENDING: 'amber',
  SUBMITTED: 'violet',
  UNDER_AUTHORITY_REVIEW: 'violet',
  APPROVED: 'green',
  REJECTED: 'rose',
  CLOSED: 'slate',
};

export const CASE_SORTS = [
  { value: 'recent', label: 'Recently opened' },
  { value: 'name', label: 'Beneficiary A–Z' },
  { value: 'expires', label: 'Expiry date (soonest)' },
  { value: 'updated', label: 'Recently updated' },
];

export type CaseListParams = {
  q?: string;
  type?: string;
  apptype?: string;
  sponsor?: string;
  owner?: string;
  expiring?: string;
  stage?: string;
  sort?: string;
};

const DAY = 24 * 60 * 60 * 1000;

/** `YYYY-MM-DD` for today and today + n days (UTC, matching the dashboard). */
function isoDay(offsetDays = 0): string {
  return new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);
}

/** Search, multi-selects, owner and expiry — everything except the stage tab. */
export function filterCases(rows: CaseListRow[], p: CaseListParams): CaseListRow[] {
  const q = (p.q ?? '').trim().toLowerCase();
  const types = new Set(readMulti(p.type));
  const appTypes = new Set(readMulti(p.apptype));
  const sponsors = new Set(readMulti(p.sponsor));
  const today = isoDay();
  const in60 = isoDay(60);
  return rows.filter((c) => {
    if (
      q &&
      ![
        c.beneficiaryName,
        c.sponsorName ?? '',
        c.authorityReference ?? '',
        c.applicationTypeName ?? '',
        c.ownerName ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(q)
    )
      return false;
    if (types.size > 0 && !types.has(c.caseType)) return false;
    if (appTypes.size > 0 && !appTypes.has(c.applicationTypeId ?? 'none')) return false;
    if (sponsors.size > 0 && !sponsors.has(c.sponsorEmployerId ?? 'none')) return false;
    if (p.owner) {
      if (p.owner === 'none' ? c.assignedUserId : c.assignedUserId !== p.owner) return false;
    }
    // Same window as the Immigration dashboard's "Expiring (60d)" tile.
    if (p.expiring === '60' && !(c.expiresOn && c.expiresOn >= today && c.expiresOn <= in60))
      return false;
    if (p.expiring === 'expired' && !(c.expiresOn && c.expiresOn < today)) return false;
    return true;
  });
}

export function stageOf(key: string | undefined) {
  return STAGE_TABS.find((t) => t.key === key) ?? STAGE_TABS[0];
}

export function matchesStage(c: CaseListRow, key: StageKey): boolean {
  const tab = stageOf(key);
  return tab.statuses === null || (tab.statuses as readonly string[]).includes(c.status);
}

export function sortCases(rows: CaseListRow[], sort: string | undefined): CaseListRow[] {
  const copy = [...rows];
  switch (sort) {
    case 'name':
      return copy.sort((a, b) => a.beneficiaryName.localeCompare(b.beneficiaryName));
    case 'expires':
      return copy.sort((a, b) => (a.expiresOn ?? '9999').localeCompare(b.expiresOn ?? '9999'));
    case 'updated':
      return copy.sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
    default:
      return copy.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }
}

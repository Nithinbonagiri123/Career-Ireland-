import type { DsTone } from '@/components/ds/tones';
import { IRISH_IMMIGRATION_STATUSES } from '@/lib/iso-countries';
import type { CandidateListRow } from '@/modules/candidates/repository';

/**
 * One filter for the Candidates list, used by BOTH the card grid and the
 * table so they always show the same rows. Every value lives in the URL;
 * multi-select params are comma-separated (`?status=AVAILABLE,PLACED`).
 */

export const CANDIDATE_STATUSES = [
  { value: 'AVAILABLE', label: 'Available' },
  // Stage B Wave 3 — derived Candidate Services progress (live / finished
  // service engagements). Placed stays the Recruitment availability value.
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'PLACED', label: 'Placed' },
  { value: 'TEMPORARILY_UNAVAILABLE', label: 'Unavailable' },
  { value: 'UNASSIGNED', label: 'Unassigned' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
  { value: 'ARCHIVED', label: 'Archived' },
] as const;

export const IMMIGRATION_OPTIONS = IRISH_IMMIGRATION_STATUSES.map((s) => ({
  value: s.value,
  label: s.value === 'NONE' ? 'No Irish permission' : s.label,
}));

export type CandidateFilterParams = {
  q?: string;
  status?: string;
  profession?: string;
  country?: string;
  assignee?: string;
  immigration?: string;
  sort?: string;
};

export function splitList(v: string | undefined | null): string[] {
  return (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Does this candidate match one status value (tab or Status filter)? */
export function matchesStatus(c: CandidateListRow, value: string): boolean {
  if (value === 'UNASSIGNED') return !c.assignedUserId;
  return (
    c.availabilityStatus === value ||
    c.lifecycleStatus === value ||
    (c.csProgressStatus !== null && c.csProgressStatus === value)
  );
}

/**
 * Filters rows by every URL filter. `occupationNames` maps the profession
 * ids in `?profession=` to names (the list row carries the name only).
 * Pass `ignoreStatus` to count status tabs over the other filters.
 */
export function filterCandidates(
  rows: CandidateListRow[],
  p: CandidateFilterParams,
  occupationNames: Map<string, string>,
  { ignoreStatus = false }: { ignoreStatus?: boolean } = {},
): CandidateListRow[] {
  const q = (p.q ?? '').trim().toLowerCase();
  const status = ignoreStatus ? [] : splitList(p.status);
  const professions = new Set(
    splitList(p.profession)
      .map((id) => occupationNames.get(id))
      .filter((n): n is string => Boolean(n)),
  );
  const professionFilter = splitList(p.profession).length > 0;
  const countries = splitList(p.country);
  const assignees = splitList(p.assignee);
  const immigration = splitList(p.immigration);
  return rows.filter((c) => {
    if (q) {
      const hay = `${c.fullName} ${c.email ?? ''} ${c.primaryOccupationName ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (status.length > 0 && !status.some((s) => matchesStatus(c, s))) return false;
    if (professionFilter && !professions.has(c.primaryOccupationName ?? '')) return false;
    if (countries.length > 0 && !countries.includes(c.currentCountry ?? '')) return false;
    if (assignees.length > 0 && !assignees.includes(c.assignedUserId ?? '')) return false;
    if (immigration.length > 0 && !immigration.includes(c.irishImmigrationStatus ?? '')) {
      return false;
    }
    return true;
  });
}

/** "Recently added" keeps the server order (activatedAt desc). */
export function sortCandidates(rows: CandidateListRow[], sort: string | undefined) {
  if (sort === 'name') return [...rows].sort((a, b) => a.fullName.localeCompare(b.fullName));
  return rows;
}

/**
 * Card / table status: availability with assignment, except an unassigned
 * active candidate reads "Unassigned"; archived / inactive lifecycle wins.
 * Same rule as before the Stage 6G restyle.
 */
export function candidateStatus(c: CandidateListRow): { tone: DsTone; label: string } {
  if (c.lifecycleStatus === 'ARCHIVED') return { tone: 'slate', label: 'Archived' };
  if (c.lifecycleStatus === 'INACTIVE') return { tone: 'slate', label: 'Inactive' };
  if (!c.assignedUserId && c.availabilityStatus === 'AVAILABLE') {
    return { tone: 'amber', label: 'Unassigned' };
  }
  switch (c.availabilityStatus) {
    case 'AVAILABLE':
      if (c.csProgressStatus === 'IN_PROGRESS') return { tone: 'blue', label: 'In progress' };
      if (c.csProgressStatus === 'COMPLETED') return { tone: 'green', label: 'Completed' };
      return { tone: 'green', label: 'Available' };
    case 'TEMPORARILY_UNAVAILABLE':
      return { tone: 'amber', label: 'Unavailable' };
    case 'PLACED':
      return { tone: 'violet', label: 'Placed' };
  }
}

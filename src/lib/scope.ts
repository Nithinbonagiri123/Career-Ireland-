import { eq, isNull, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';

/**
 * Assignment-scope filter used by list endpoints. Encoded as a URL search param
 * (`?assigned=me|unassigned|all`) so filter state survives page refreshes and is
 * bookmarkable.
 *
 * Session 35 — the DEFAULT when no param is present is `mine`. The owner's
 * explicit UX call: "no one wants to see all cases first; they want their own."
 * Visiting a bare `/candidates`, `/employers`, etc. scopes to the current
 * user's assigned rows. Click the "All" chip to see everyone's.
 */
export type AssignmentScope = 'all' | 'mine' | 'unassigned';

export const ALL_SCOPES: AssignmentScope[] = ['all', 'mine', 'unassigned'];

export function parseAssignmentScope(v: string | null | undefined): AssignmentScope {
  if (v === 'all' || v === 'unassigned') return v;
  // Both the explicit `me` and the missing param resolve to `mine` so that
  // bare URLs ("/candidates") land the operator on their own work by default.
  return 'mine';
}

/**
 * Returns a Drizzle SQL condition suitable for a `.where(...)` clause. Callers must
 * combine with `and(...)` themselves if they have other predicates.
 * `null` means "no filter" (all rows).
 */
export function assignmentCondition(
  scope: AssignmentScope,
  column: PgColumn,
  currentUserId: string,
): SQL | undefined {
  if (scope === 'mine') return eq(column, currentUserId);
  if (scope === 'unassigned') return isNull(column);
  return undefined;
}

export const SCOPE_LABEL: Record<AssignmentScope, string> = {
  all: 'All',
  mine: 'Assigned to me',
  unassigned: 'Unassigned',
};

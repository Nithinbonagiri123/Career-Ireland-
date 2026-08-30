import { eq, isNull, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';

/**
 * Assignment-scope filter used by list endpoints. Encoded as a URL search param
 * (`?assigned=me|unassigned|all`) so filter state survives page refreshes and is
 * bookmarkable.
 */
export type AssignmentScope = 'all' | 'mine' | 'unassigned';

export const ALL_SCOPES: AssignmentScope[] = ['all', 'mine', 'unassigned'];

export function parseAssignmentScope(v: string | null | undefined): AssignmentScope {
  return v === 'mine' || v === 'unassigned' ? v : 'all';
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

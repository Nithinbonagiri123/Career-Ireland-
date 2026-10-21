/**
 * Stage B Wave 3 — candidate Notes permission rule, kept pure (no auth /
 * DB imports) so vitest can lock it down without the next-auth module
 * graph.
 *
 * Notes are communication_logs rows with type INTERNAL_NOTE. Any internal
 * staff member can ADD a note; editing or archiving an existing note is
 * restricted to its author, an ADMIN, or the account owner. Every other
 * communication type keeps the pre-Wave-3 behaviour (any internal staff),
 * so the shared Communications workspace is untouched.
 */
export function canModifyNote(
  row: { type: string; staffUserId: string },
  actor: { userId: string; role: string; isOwner: boolean },
): boolean {
  if (row.type !== 'INTERNAL_NOTE') return true;
  if (actor.isOwner || actor.role === 'ADMIN') return true;
  return row.staffUserId === actor.userId;
}

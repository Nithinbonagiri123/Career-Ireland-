import { requireInternalStaff } from '@/lib/auth/session';
import type { DateRange } from '@/lib/date-range';
import type { AssignmentScope } from '@/lib/scope';
import { type CandidateListRow, listCandidates } from './repository';

export async function fetchCandidates(
  scope?: AssignmentScope,
  createdRange?: DateRange,
): Promise<CandidateListRow[]> {
  const session = await requireInternalStaff();
  return listCandidates({
    scope: scope ?? 'all',
    currentUserId: session.user.id,
    createdRange,
  });
}

import { requireRole } from '@/lib/auth/session';
import type { AssignmentScope } from '@/lib/scope';
import { type CandidateListRow, listCandidates } from './repository';

export async function fetchCandidates(scope?: AssignmentScope): Promise<CandidateListRow[]> {
  const session = await requireRole(['ADMIN', 'STAFF']);
  return listCandidates({ scope: scope ?? 'all', currentUserId: session.user.id });
}

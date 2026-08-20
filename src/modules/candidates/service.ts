import { requireRole } from '@/lib/auth/session';
import { type CandidateListRow, listCandidates } from './repository';

export async function fetchCandidates(): Promise<CandidateListRow[]> {
  await requireRole(['ADMIN', 'STAFF']);
  return listCandidates();
}

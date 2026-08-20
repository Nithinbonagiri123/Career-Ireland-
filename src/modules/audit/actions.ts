'use server';

import { toActionResult } from '@/lib/result';
import type { AuditListQuery } from './schemas';
import { fetchAuditEvents } from './service';

export async function loadMoreAuditEventsAction(input: AuditListQuery) {
  return toActionResult(() => fetchAuditEvents(input));
}

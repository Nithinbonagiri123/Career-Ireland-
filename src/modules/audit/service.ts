import { requireRole } from '@/lib/auth/session';
import {
  type AuditEventWithActor,
  listAuditEvents,
  listDistinctActions,
  listDistinctActors,
  listDistinctEntityTypes,
} from './repository';
import { type AuditListQuery, AuditListQuerySchema } from './schemas';

/**
 * ADMIN-only view of the audit log.
 * Reuse `requireRole` from the shared session helper (never re-implement auth).
 */
export async function fetchAuditEvents(input: unknown): Promise<{
  items: AuditEventWithActor[];
  nextCursor: AuditListQuery['cursor'] | null;
}> {
  await requireRole(['ADMIN']);
  const query = AuditListQuerySchema.parse(input ?? {});
  return listAuditEvents(query);
}

export async function fetchAuditEntityTypes(): Promise<string[]> {
  await requireRole(['ADMIN']);
  return listDistinctEntityTypes();
}

export async function fetchAuditActions(): Promise<string[]> {
  await requireRole(['ADMIN']);
  return listDistinctActions();
}

export async function fetchAuditActors(): Promise<
  Array<{ id: string; email: string; fullName: string }>
> {
  await requireRole(['ADMIN']);
  return listDistinctActors();
}

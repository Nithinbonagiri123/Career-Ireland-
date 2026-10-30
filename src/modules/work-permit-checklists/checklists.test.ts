import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db/client';
import { auditEvents } from '@/lib/db/schema/audit_events';
import { workPermitChecklists } from '@/lib/db/schema/work_permit_checklists';
import { cleanupDb, e2eAdminId, seedJob, seedPeople } from '@/test/db-fixtures';

/** R6 — work-permit checklists against the real DB. */

const session = { user: { id: '', role: 'ADMIN', isOwner: false, email: '', name: '' } };
vi.mock('@/lib/auth/session', () => ({
  requireInternalStaff: vi.fn(async () => session),
  requirePermission: vi.fn(async () => session),
}));

const svc = await import('./service');
const STAMP = `vitest-wpc-${Date.now()}`;
const ids = { jobId: '', employerId: '', people: [] as string[] };

beforeAll(async () => {
  session.user.id = await e2eAdminId();
  Object.assign(ids, await seedJob(STAMP));
  ids.people = await seedPeople(STAMP, ['Ann', 'Ben']);
});
afterAll(() => cleanupDb([ids.jobId], ids.people, [ids.employerId]));

describe('work-permit checklists', () => {
  it('one checklist per candidate per job: a second save updates it (audited)', async () => {
    const [ann] = ids.people as [string];
    const first = await svc.upsertChecklist({
      jobRequisitionId: ids.jobId,
      personId: ann,
      matchChecks: { salary: { value: 'YES' } },
    } as never);
    const second = await svc.upsertChecklist({
      jobRequisitionId: ids.jobId,
      personId: ann,
      matchChecks: { salary: { value: 'NO', note: 'Below threshold' } },
      notes: 'Re-checked against contract',
    } as never);
    expect(second.id).toBe(first.id);
    const rows = await db
      .select()
      .from(workPermitChecklists)
      .where(
        and(
          eq(workPermitChecklists.jobRequisitionId, ids.jobId),
          eq(workPermitChecklists.personId, ann),
        ),
      );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.notes).toBe('Re-checked against contract');
    const actions = (
      await db.select().from(auditEvents).where(eq(auditEvents.entityId, first.id))
    ).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['CREATED', 'UPDATED']));
  });

  it('lists per job and deletes with an audit entry', async () => {
    const [, ben] = ids.people as [string, string];
    const c = await svc.upsertChecklist({ jobRequisitionId: ids.jobId, personId: ben } as never);
    const listed = await svc.listChecklistsForRequisition(ids.jobId);
    expect(listed.map((r) => r.personId)).toEqual(expect.arrayContaining(ids.people));
    await svc.deleteChecklist(c.id);
    expect(
      await db.select().from(workPermitChecklists).where(eq(workPermitChecklists.id, c.id)),
    ).toHaveLength(0);
    const [del] = await db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.entityId, c.id), eq(auditEvents.action, 'DELETED')));
    expect(del).toBeTruthy();
  });

  it('refuses an unknown job or person', async () => {
    await expect(
      svc.upsertChecklist({
        jobRequisitionId: '00000000-0000-4000-8000-000000000000',
        personId: ids.people[0],
      } as never),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

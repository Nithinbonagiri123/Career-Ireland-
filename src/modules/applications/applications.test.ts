import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db/client';
import { auditEvents } from '@/lib/db/schema/audit_events';
import { jobApplications, placements } from '@/lib/db/schema/recruitment';
import { cleanupDb, e2eAdminId, seedJob, seedPeople } from '@/test/db-fixtures';

/** R6 — job applications against the real DB (permissions covered in r6-permissions.test). */

const session = { user: { id: '', role: 'ADMIN', isOwner: false, email: '', name: '' } };
vi.mock('@/lib/auth/session', () => ({
  requireInternalStaff: vi.fn(async () => session),
  requirePermission: vi.fn(async () => session),
}));

const svc = await import('./service');
const STAMP = `vitest-apps-${Date.now()}`;
const ids = { jobId: '', employerId: '', people: [] as string[] };

beforeAll(async () => {
  session.user.id = await e2eAdminId();
  Object.assign(ids, await seedJob(STAMP));
  ids.people = await seedPeople(STAMP, ['Ann', 'Ben', 'Cara', 'Dan']);
});
afterAll(() => cleanupDb([ids.jobId], ids.people, [ids.employerId]));

const appOf = async (personId: string) =>
  (
    await db
      .select()
      .from(jobApplications)
      .where(
        and(
          eq(jobApplications.jobRequisitionId, ids.jobId),
          eq(jobApplications.personId, personId),
        ),
      )
  )[0];

describe('job applications', () => {
  it('creates an APPLIED application once per person per job (audited)', async () => {
    const [ann] = ids.people as [string];
    const created = await svc.createApplication({ jobRequisitionId: ids.jobId, personId: ann });
    expect(created.status).toBe('APPLIED');
    expect(created.source).toBe('INTERNAL');
    await expect(
      svc.createApplication({ jobRequisitionId: ids.jobId, personId: ann }),
    ).rejects.toMatchObject({ code: 'APPLICATION_EXISTS' });
    const audits = await db.select().from(auditEvents).where(eq(auditEvents.entityId, created.id));
    expect(audits.map((a) => a.action)).toContain('CREATED');
  });

  it('follows the application state machine and records rejection reasons', async () => {
    const [, ben] = ids.people as [string, string];
    const app = await svc.createApplication({ jobRequisitionId: ids.jobId, personId: ben });
    await svc.updateApplicationStatus({ applicationId: app.id, status: 'INTERVIEW' });
    await expect(
      svc.updateApplicationStatus({ applicationId: app.id, status: 'APPLIED' }),
    ).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' });
    const rejected = await svc.updateApplicationStatus({
      applicationId: app.id,
      status: 'REJECTED',
      rejectionReason: 'No driving licence',
    });
    expect(rejected.rejectionReason).toBe('No driving licence');
    const [audit] = await db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.entityId, app.id), eq(auditEvents.action, 'STATUS_CHANGED')))
      .orderBy(auditEvents.occurredAt);
    expect(audit?.before).toEqual({ status: 'APPLIED' });
  });

  it('ACCEPTED proposes exactly one placement (a seat is not taken until confirmed)', async () => {
    const [, , cara] = ids.people as [string, string, string];
    const app = await svc.createApplication({ jobRequisitionId: ids.jobId, personId: cara });
    await svc.updateApplicationStatus({ applicationId: app.id, status: 'INTERVIEW' });
    await svc.updateApplicationStatus({ applicationId: app.id, status: 'OFFER' });
    await svc.updateApplicationStatus({ applicationId: app.id, status: 'ACCEPTED' });
    // Repeating the same status is a no-op, not a second placement.
    await svc.updateApplicationStatus({ applicationId: app.id, status: 'ACCEPTED' });
    const rows = await db.select().from(placements).where(eq(placements.jobApplicationId, app.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('PROPOSED');
  });

  it('external job-board applications are recorded per person without a job', async () => {
    const [, , , dan] = ids.people as [string, string, string, string];
    const ext = await svc.createExternalApplication({
      personId: dan,
      source: 'INDEED',
      externalCompanyName: `${STAMP} Elsewhere`,
      externalJobTitle: 'Carer',
    } as never);
    expect(ext.jobRequisitionId).toBeNull();
    const list = await svc.listApplicationsForPerson(dan);
    expect(list.some((a) => a.id === ext.id && a.source === 'INDEED')).toBe(true);
    expect(await appOf(dan)).toBeUndefined();
  });
});

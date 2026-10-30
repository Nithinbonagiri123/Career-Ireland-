import { eq, inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db/client';
import { communicationLogs, tasks } from '@/lib/db/schema/activities';
import { auditEvents } from '@/lib/db/schema/audit_events';
import { leads } from '@/lib/db/schema/leads';
import { persons } from '@/lib/db/schema/persons';
import {
  employerContacts,
  employers,
  jobApplications,
  jobRequisitions,
  placements,
} from '@/lib/db/schema/recruitment';
import { type UserRole, users } from '@/lib/db/schema/users';
import { workPermitChecklists } from '@/lib/db/schema/work_permit_checklists';

/**
 * R6 — Recruitment writes are enforced on the server with the existing
 * recruitment.* permissions, evaluated from the real role presets:
 *   RECRUITER: recruitment view/create/edit (allowed)
 *   STAFF:     no grants (refused)
 *   FINANCE:   recruitment employers/requisitions/placements VIEW only (refused)
 * Records outside Recruitment keep the existing internal-staff rule
 * (candidate notes, person-only tasks, Candidate Services leads,
 * external job-board applications).
 */

const session = {
  user: {
    id: '',
    email: 'r6@example.test',
    name: 'R6 Tester',
    role: 'RECRUITER' as UserRole,
    isOwner: false,
    personId: null,
    employerId: null,
  },
};
vi.mock('@/lib/auth/session', async () => {
  const { AuthorizationError } = await import('@/lib/errors');
  const { presetForRole, hasPermission, encodeKey } = await import('@/lib/auth/permissions');
  const INTERNAL = ['ADMIN', 'STAFF', 'MANAGER', 'RECRUITER', 'DOCUMENT_SPECIALIST', 'FINANCE'];
  const granted = () =>
    new Set(
      presetForRole(session.user.role as Parameters<typeof presetForRole>[0]).map((k) =>
        encodeKey(k.business, k.module, k.verb),
      ),
    );
  return {
    requireInternalStaff: vi.fn(async () => {
      if (!INTERNAL.includes(session.user.role)) throw new AuthorizationError();
      return session;
    }),
    requirePermission: vi.fn(async (b: string, m: string, v: string) => {
      if (!session.user.isOwner && !hasPermission(granted(), b as 'recruitment', m, v as 'edit')) {
        throw new AuthorizationError();
      }
      return session;
    }),
    requireRole: vi.fn(async () => session),
  };
});

const emp = await import('@/modules/employers/service');
const req = await import('@/modules/requisitions/service');
const apps = await import('@/modules/applications/service');
const pl = await import('@/modules/placements/service');
const wpc = await import('@/modules/work-permit-checklists/service');
const act = await import('@/modules/activities/service');
const ld = await import('@/modules/leads/service');

const STAMP = `vitest-r6-${Date.now()}`;
const ids = {
  user: '',
  employer: '',
  job: '',
  person: '',
  internalApp: '',
  externalApp: '',
  placement: '',
  recLead: '',
  csLead: '',
};
const DENIED = { code: 'AUTHORIZATION_ERROR' };

beforeAll(async () => {
  const [admin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, 'e2e-admin@ireland-careers.test'))
    .limit(1);
  if (!admin) throw new Error('e2e admin seed missing');
  ids.user = admin.id;
  session.user.id = admin.id;
  const [e] = await db
    .insert(employers)
    .values({ legalName: `${STAMP} Ltd` })
    .returning();
  ids.employer = e?.id ?? '';
  const [j] = await db
    .insert(jobRequisitions)
    .values({
      employerId: ids.employer,
      title: `${STAMP} job`,
      positionsRequired: 2,
      employmentType: 'FULL_TIME',
      status: 'OPEN',
    })
    .returning();
  ids.job = j?.id ?? '';
  const [p] = await db
    .insert(persons)
    .values({ firstName: 'R6', lastName: STAMP, source: 'DIRECT' })
    .returning();
  ids.person = p?.id ?? '';
  const [ia, ea] = await db
    .insert(jobApplications)
    .values([
      { personId: ids.person, jobRequisitionId: ids.job, status: 'APPLIED' },
      {
        personId: ids.person,
        source: 'IRISH_JOBS',
        externalCompanyName: `${STAMP} Elsewhere`,
        status: 'APPLIED',
      },
    ])
    .returning();
  ids.internalApp = ia?.id ?? '';
  ids.externalApp = ea?.id ?? '';
  const [plc] = await db
    .insert(placements)
    .values({
      personId: ids.person,
      employerId: ids.employer,
      jobRequisitionId: ids.job,
      status: 'PROPOSED',
    })
    .returning();
  ids.placement = plc?.id ?? '';
  const [rl, cl] = await db
    .insert(leads)
    .values([
      { targetBusiness: 'RECRUITMENT', employerId: ids.employer, status: 'NEW' },
      { targetBusiness: 'CANDIDATE_SERVICES', personId: ids.person, status: 'NEW' },
    ])
    .returning();
  ids.recLead = rl?.id ?? '';
  ids.csLead = cl?.id ?? '';
});

beforeEach(() => {
  session.user.role = 'RECRUITER';
});

afterAll(async () => {
  const taskRows = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      sql`${tasks.jobRequisitionId} = ${ids.job} OR ${tasks.personId} = ${ids.person} OR ${tasks.employerId} = ${ids.employer}`,
    );
  const commRows = await db
    .select({ id: communicationLogs.id })
    .from(communicationLogs)
    .where(
      sql`${communicationLogs.personId} = ${ids.person} OR ${communicationLogs.employerId} = ${ids.employer}`,
    );
  const contactRows = await db
    .select({ id: employerContacts.id })
    .from(employerContacts)
    .where(eq(employerContacts.employerId, ids.employer));
  const checklistRows = await db
    .select({ id: workPermitChecklists.id })
    .from(workPermitChecklists)
    .where(eq(workPermitChecklists.jobRequisitionId, ids.job));
  const entity = [
    ...Object.values(ids),
    ...taskRows.map((r) => r.id),
    ...commRows.map((r) => r.id),
    ...contactRows.map((r) => r.id),
    ...checklistRows.map((r) => r.id),
  ].filter(Boolean);
  await db.delete(auditEvents).where(inArray(auditEvents.entityId, entity));
  if (taskRows.length)
    await db.delete(tasks).where(
      inArray(
        tasks.id,
        taskRows.map((r) => r.id),
      ),
    );
  if (commRows.length)
    await db.delete(communicationLogs).where(
      inArray(
        communicationLogs.id,
        commRows.map((r) => r.id),
      ),
    );
  await db.delete(workPermitChecklists).where(eq(workPermitChecklists.jobRequisitionId, ids.job));
  await db.delete(employerContacts).where(eq(employerContacts.employerId, ids.employer));
  await db.delete(leads).where(inArray(leads.id, [ids.recLead, ids.csLead]));
  await db.delete(placements).where(eq(placements.jobRequisitionId, ids.job));
  await db.delete(jobApplications).where(eq(jobApplications.personId, ids.person));
  await db.delete(jobRequisitions).where(eq(jobRequisitions.employerId, ids.employer));
  await db.delete(persons).where(eq(persons.id, ids.person));
  await db.delete(employers).where(eq(employers.id, ids.employer));
});

const employerInput = (legalName: string) => ({
  legalName,
  tradingName: '',
  website: '',
  industry: '',
  country: '',
  city: '',
  addressLine1: '',
  addressLine2: '',
  postcode: '',
  billingEmail: '',
  vatId: '',
  vatTreatment: 'STANDARD' as const,
  paymentTermsDays: 30,
  relationshipStatus: 'PROSPECT' as const,
  notes: '',
});

describe.each(['STAFF', 'FINANCE'] as const)('%s is refused Recruitment writes', (role) => {
  it('employers, jobs, applications, placements, checklists', async () => {
    session.user.role = role;
    await expect(
      emp.upsertEmployer(employerInput(`${STAMP} ${role}`) as never),
    ).rejects.toMatchObject(DENIED);
    await expect(emp.markEmployerOnboardingComplete(ids.employer)).rejects.toMatchObject(DENIED);
    await expect(
      emp.upsertEmployerContact({
        employerId: ids.employer,
        fullName: 'Nope Person',
        isPrimary: false,
      } as never),
    ).rejects.toMatchObject(DENIED);
    await expect(
      req.updateRequisitionStatus({ requisitionId: ids.job, status: 'IN_PROGRESS' } as never),
    ).rejects.toMatchObject(DENIED);
    await expect(
      apps.updateApplicationStatus({ applicationId: ids.internalApp, status: 'UNDER_REVIEW' }),
    ).rejects.toMatchObject(DENIED);
    await expect(
      pl.updatePlacementStatus({ placementId: ids.placement, status: 'TERMINATED_EARLY' }),
    ).rejects.toMatchObject(DENIED);
    await expect(
      wpc.upsertChecklist({ jobRequisitionId: ids.job, personId: ids.person } as never),
    ).rejects.toMatchObject(DENIED);
  });

  it('tasks / communications on a job or employer, and Recruitment leads', async () => {
    session.user.role = role;
    await expect(
      act.createTask({
        title: 'Call the employer',
        assignedUserId: ids.user,
        priority: 'NORMAL',
        jobRequisitionId: ids.job,
      } as never),
    ).rejects.toMatchObject(DENIED);
    await expect(
      act.createCommunication({
        type: 'PHONE',
        direction: 'OUTBOUND',
        followUpRequired: false,
        employerId: ids.employer,
      } as never),
    ).rejects.toMatchObject(DENIED);
    await expect(
      ld.updateLeadStatus({ leadId: ids.recLead, status: 'CONTACTED' } as never),
    ).rejects.toMatchObject(DENIED);
  });
});

describe('outside Recruitment the existing staff rule is unchanged', () => {
  it('STAFF can still add a candidate note, a personal task, move an external application and a Candidate Services lead', async () => {
    session.user.role = 'STAFF';
    const note = await act.createCommunication({
      type: 'INTERNAL_NOTE',
      direction: 'INTERNAL',
      followUpRequired: false,
      personId: ids.person,
      body: 'Called back, available Monday',
    } as never);
    expect(note.personId).toBe(ids.person);
    const t = await act.createTask({
      title: 'Personal follow-up',
      assignedUserId: ids.user,
      priority: 'NORMAL',
      personId: ids.person,
    } as never);
    expect(t.personId).toBe(ids.person);
    const ext = await apps.updateApplicationStatus({
      applicationId: ids.externalApp,
      status: 'UNDER_REVIEW',
    });
    expect(ext.status).toBe('UNDER_REVIEW');
    const csl = await ld.updateLeadStatus({ leadId: ids.csLead, status: 'CONTACTED' } as never);
    expect(csl.status).toBe('CONTACTED');
  });
});

describe('RECRUITER (recruitment view/create/edit) can do the Recruitment work', () => {
  it('employer, contact, job status, application, placement, checklist, linked task, lead', async () => {
    const created = await emp.upsertEmployer(employerInput(`${STAMP} recruiter co`) as never);
    expect(created.id).toBeTruthy();
    await db.delete(auditEvents).where(eq(auditEvents.entityId, created.id));
    await db.delete(employers).where(eq(employers.id, created.id));
    await emp.upsertEmployerContact({
      employerId: ids.employer,
      fullName: 'Mary Hiring',
      isPrimary: true,
    } as never);
    const job = await req.updateRequisitionStatus({
      requisitionId: ids.job,
      status: 'IN_PROGRESS',
    } as never);
    expect(job.status).toBe('IN_PROGRESS');
    const app = await apps.updateApplicationStatus({
      applicationId: ids.internalApp,
      status: 'UNDER_REVIEW',
    });
    expect(app.status).toBe('UNDER_REVIEW');
    const placement = await pl.updatePlacementStatus({
      placementId: ids.placement,
      status: 'TERMINATED_EARLY',
    });
    expect(placement.status).toBe('TERMINATED_EARLY');
    const checklist = await wpc.upsertChecklist({
      jobRequisitionId: ids.job,
      personId: ids.person,
    } as never);
    expect(checklist.jobRequisitionId).toBe(ids.job);
    const task = await act.createTask({
      title: 'Chase employer for start date',
      assignedUserId: ids.user,
      priority: 'NORMAL',
      jobRequisitionId: ids.job,
    } as never);
    await act.updateTaskStatus({ taskId: task.id, status: 'DONE' } as never);
    const lead = await ld.updateLeadStatus({ leadId: ids.recLead, status: 'CONTACTED' } as never);
    expect(lead.status).toBe('CONTACTED');
  });

  it('reads stay open to internal staff (FINANCE can still view jobs and placements)', async () => {
    session.user.role = 'FINANCE';
    expect(await req.fetchRequisition(ids.job)).toBeTruthy();
    expect(Array.isArray(await pl.listPlacementsForRequisition(ids.job))).toBe(true);
  });
});

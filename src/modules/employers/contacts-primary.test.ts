import { eq, inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db/client';
import { auditEvents } from '@/lib/db/schema/audit_events';
import { employerContacts, employers } from '@/lib/db/schema/recruitment';
import { users } from '@/lib/db/schema/users';

/**
 * W3 — employer contacts: one primary per employer, and every primary
 * change is named in the audit trail and the employer's Activity tab
 * ("Bob Smith added as primary contact (replaced Alice Primary)").
 * Permissions come from the real ADMIN preset.
 */

const session = {
  user: {
    id: '',
    email: 'contacts-primary@example.test',
    name: 'Contacts Primary',
    role: 'ADMIN' as const,
    isOwner: false,
    personId: null,
    employerId: null,
  },
};

vi.mock('@/lib/auth/session', async () => {
  const { AuthorizationError: AuthErr } = await import('@/lib/errors');
  const { presetForRole, hasPermission, encodeKey } = await import('@/lib/auth/permissions');
  const granted = () =>
    new Set(presetForRole(session.user.role).map((k) => encodeKey(k.business, k.module, k.verb)));
  return {
    requireSession: vi.fn(async () => session),
    requireInternalStaff: vi.fn(async () => session),
    requireRole: vi.fn(async () => session),
    requirePermission: vi.fn(async (b: string, m: string, v: string) => {
      if (!session.user.isOwner && !hasPermission(granted(), b as 'main', m, v as 'view')) {
        throw new AuthErr();
      }
      return session;
    }),
  };
});

const svc = await import('./service');

const STAMP = `VITEST_W3CONTACTS_${Date.now()}`;
const employerIds: string[] = [];

async function seedEmployer(label: string) {
  const [e] = await db
    .insert(employers)
    .values({ legalName: `${STAMP} ${label}`, assignedUserId: session.user.id })
    .returning({ id: employers.id });
  if (!e) throw new Error('seed failed');
  employerIds.push(e.id);
  return e.id;
}

async function contactAudits(employerId: string) {
  return db
    .select()
    .from(auditEvents)
    .where(
      sql`${auditEvents.entityType} = 'employer_contact' AND ${auditEvents.context} ->> 'employerId' = ${employerId}`,
    );
}

beforeAll(async () => {
  const [u] = await db
    .insert(users)
    .values({
      email: `${STAMP.toLowerCase()}@example.test`,
      passwordHash: 'x',
      fullName: `${STAMP} HR Manager`,
      role: 'ADMIN',
    })
    .returning({ id: users.id });
  if (!u) throw new Error('user seed failed');
  session.user.id = u.id;
});

afterAll(async () => {
  if (employerIds.length > 0) {
    const contacts = await db
      .select({ id: employerContacts.id })
      .from(employerContacts)
      .where(inArray(employerContacts.employerId, employerIds));
    const ids = [...employerIds, ...contacts.map((c) => c.id)];
    await db.delete(auditEvents).where(inArray(auditEvents.entityId, ids));
    await db.delete(auditEvents).where(eq(auditEvents.actorUserId, session.user.id));
    await db.delete(employerContacts).where(inArray(employerContacts.employerId, employerIds));
    await db.delete(employers).where(inArray(employers.id, employerIds));
  }
  if (session.user.id) {
    await db.delete(auditEvents).where(eq(auditEvents.actorUserId, session.user.id));
    await db.delete(users).where(eq(users.id, session.user.id));
  }
});

describe('employer primary contact changes', () => {
  it('adding a second primary demotes the first, in one transaction, and names both', async () => {
    const employerId = await seedEmployer('Acme Care');
    const alice = await svc.upsertEmployerContact({
      employerId,
      fullName: 'Alice Primary',
      jobTitle: 'HR Director',
      isPrimary: true,
    });
    expect(alice.replacedPrimary).toEqual([]);

    const bob = await svc.upsertEmployerContact({
      employerId,
      fullName: 'Bob Smith',
      isPrimary: true,
    });
    expect(bob.replacedPrimary).toEqual([{ id: alice.id, fullName: 'Alice Primary' }]);

    const rows = await db
      .select({ fullName: employerContacts.fullName, isPrimary: employerContacts.isPrimary })
      .from(employerContacts)
      .where(eq(employerContacts.employerId, employerId));
    expect(rows.filter((r) => r.isPrimary).map((r) => r.fullName)).toEqual(['Bob Smith']);
    // Bob did not inherit Alice's job title (the old prefilled-dialog bug).
    expect(await svc.fetchPrimaryContact(employerId)).toEqual({
      id: bob.id,
      fullName: 'Bob Smith',
    });

    const audits = await contactAudits(employerId);
    const created = audits.find((a) => a.entityId === bob.id && a.action === 'CREATED');
    expect(created?.after).toMatchObject({
      fullName: 'Bob Smith',
      isPrimary: true,
      jobTitle: null,
    });
    expect(created?.context).toMatchObject({
      replacedPrimary: [{ id: alice.id, fullName: 'Alice Primary' }],
    });
    const demoted = audits.find((a) => a.entityId === alice.id && a.action === 'UPDATED');
    expect(demoted?.before).toMatchObject({ isPrimary: true });
    expect(demoted?.after).toMatchObject({ isPrimary: false });
    expect(demoted?.context).toMatchObject({
      via: 'primary_contact_change',
      replacedBy: { fullName: 'Bob Smith' },
    });

    const activity = (await svc.fetchEmployerActivity(employerId)).map((a) => a.summary);
    expect(activity).toContain('Bob Smith added as primary contact (replaced Alice Primary)');
    expect(activity).toContain(
      'Alice Primary is no longer the primary contact (replaced by Bob Smith)',
    );
    expect(activity).toContain('Alice Primary added as primary contact');
  });

  it('editing a contact back to primary records before/after; deleting the primary is named', async () => {
    const employerId = await seedEmployer('Beta Homes');
    const alice = await svc.upsertEmployerContact({
      employerId,
      fullName: 'Alice Primary',
      isPrimary: true,
    });
    const bob = await svc.upsertEmployerContact({
      employerId,
      fullName: 'Bob Smith',
      isPrimary: false,
    });
    const again = await svc.upsertEmployerContact({
      id: bob.id,
      employerId,
      fullName: 'Bob Smith',
      email: 'bob@beta.example',
      isPrimary: true,
    });
    expect(again.replacedPrimary.map((c) => c.fullName)).toEqual(['Alice Primary']);
    const audits = await contactAudits(employerId);
    const update = audits.find(
      (a) =>
        a.entityId === bob.id && a.action === 'UPDATED' && !(a.context as { via?: string })?.via,
    );
    expect(update?.before).toMatchObject({ isPrimary: false, email: null });
    expect(update?.after).toMatchObject({ isPrimary: true, email: 'bob@beta.example' });

    await svc.deleteEmployerContact(bob.id);
    const activity = (await svc.fetchEmployerActivity(employerId)).map((a) => a.summary);
    expect(activity).toContain('Bob Smith made primary contact (replaced Alice Primary)');
    // The deleted contact's history stays visible on the employer.
    expect(activity).toContain('Bob Smith (primary contact) removed — no primary contact now');
    expect(alice.id).toBeTruthy();
  });

  it('refuses to edit a contact through a different employer', async () => {
    const a = await seedEmployer('Gamma One');
    const b = await seedEmployer('Gamma Two');
    const c = await svc.upsertEmployerContact({ employerId: a, fullName: 'Cara', isPrimary: true });
    await expect(
      svc.upsertEmployerContact({ id: c.id, employerId: b, fullName: 'Cara', isPrimary: true }),
    ).rejects.toMatchObject({ code: 'CONTACT_EMPLOYER_MISMATCH' });
    // Employer A keeps Cara as its primary; nothing on B was demoted.
    expect(await svc.fetchPrimaryContact(a)).toMatchObject({ id: c.id });
  });
});

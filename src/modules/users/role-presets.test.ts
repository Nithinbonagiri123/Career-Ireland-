import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { presetForRole } from '@/lib/auth/permissions';
import { roleSatisfies } from '@/lib/auth/role-rules';
import { db } from '@/lib/db/client';
import { auditEvents } from '@/lib/db/schema/audit_events';
import { userPermissions } from '@/lib/db/schema/permissions';
import { type UserRole, users } from '@/lib/db/schema/users';

/**
 * Phase 1 Item 3 — identity and owner authority.
 *   A1 / CH-04: a new account gets exactly its role's preset grants.
 *   A1 / CH-02: a role change REPLACES grants with the new preset.
 *   B1 / CH-03: an owner satisfies ADMIN-only role checks.
 *   Owner protection: a non-owner ADMIN cannot change or deactivate an owner.
 * Hits the real dev/CI DB with VITEST-prefixed rows, deleted in afterAll.
 */

const session = {
  user: {
    id: '',
    email: '',
    name: '',
    role: 'ADMIN' as UserRole,
    isOwner: false,
    personId: null,
    employerId: null,
  },
};
vi.mock('@/lib/auth/session', async () => {
  const { roleSatisfies: rs } = await import('@/lib/auth/role-rules');
  const { AuthorizationError } = await import('@/lib/errors');
  return {
    requireRole: vi.fn(async (roles: UserRole[]) => {
      if (!rs(session.user, roles)) throw new AuthorizationError();
      return session;
    }),
    requireOwner: vi.fn(async () => {
      if (!session.user.isOwner) throw new AuthorizationError();
      return session;
    }),
    requireInternalStaff: vi.fn(async () => session),
    getSession: vi.fn(async () => session),
    requireSession: vi.fn(async () => session),
  };
});

const { createUser, changeUserRole, setUserActive } = await import('./service');

const STAMP = `vitest-roles-${Date.now()}`;
const createdIds: string[] = [];
let adminId = '';
let ownerId = '';

async function grantsOf(userId: string): Promise<string[]> {
  const rows = await db
    .select({ b: userPermissions.business, m: userPermissions.module, v: userPermissions.verb })
    .from(userPermissions)
    .where(eq(userPermissions.userId, userId));
  return rows.map((r) => `${r.b}.${r.m}.${r.v}`).sort();
}
function presetKeys(role: UserRole): string[] {
  return presetForRole(role as Parameters<typeof presetForRole>[0])
    .map((k) => `${k.business}.${k.module}.${k.verb}`)
    .sort();
}

beforeAll(async () => {
  const [a] = await db
    .insert(users)
    .values({
      email: `${STAMP}-admin@example.test`,
      fullName: 'Roles Admin',
      role: 'ADMIN',
      passwordHash: 'x',
    })
    .returning({ id: users.id });
  const [o] = await db
    .insert(users)
    .values({
      email: `${STAMP}-owner@example.test`,
      fullName: 'Roles Owner',
      role: 'MANAGER',
      isOwner: true,
      passwordHash: 'x',
    })
    .returning({ id: users.id });
  if (!a || !o) throw new Error('seed failed');
  adminId = a.id;
  ownerId = o.id;
  createdIds.push(a.id, o.id);
});

afterAll(async () => {
  if (createdIds.length === 0) return;
  await db.delete(auditEvents).where(inArray(auditEvents.entityId, createdIds));
  await db.delete(userPermissions).where(inArray(userPermissions.userId, createdIds));
  await db.delete(userPermissions).where(inArray(userPermissions.grantedByUserId, createdIds));
  await db.delete(auditEvents).where(inArray(auditEvents.actorUserId, createdIds));
  await db.delete(users).where(inArray(users.id, createdIds));
});

describe('B1 — owner satisfies ADMIN-only role checks', () => {
  it('owner flag admits lists containing ADMIN, never others', () => {
    expect(roleSatisfies({ role: 'MANAGER', isOwner: true }, ['ADMIN'])).toBe(true);
    expect(roleSatisfies({ role: 'STAFF', isOwner: true }, ['ADMIN', 'FINANCE'])).toBe(true);
    expect(roleSatisfies({ role: 'STAFF', isOwner: true }, ['DOCUMENT_SPECIALIST'])).toBe(false);
    expect(roleSatisfies({ role: 'MANAGER', isOwner: false }, ['ADMIN'])).toBe(false);
    expect(roleSatisfies({ role: 'CANDIDATE', isOwner: true }, ['ADMIN'])).toBe(false);
  });
});

describe('A1 — grants follow the role preset', () => {
  it('createUser applies the role preset (CH-04)', async () => {
    session.user = { ...session.user, id: adminId, role: 'ADMIN', isOwner: false };
    const row = await createUser({
      email: `${STAMP}-recruiter@example.test`,
      fullName: 'Rita Recruiter',
      role: 'RECRUITER',
      isOwner: false,
      password: 'Vq7!mZr2#Lp9wXc4',
    });
    createdIds.push(row.id);
    expect(await grantsOf(row.id)).toEqual(presetKeys('RECRUITER'));
    expect((await grantsOf(row.id)).length).toBeGreaterThan(0);
  });

  it('changeUserRole replaces grants with the new preset and audits both sets (CH-02)', async () => {
    session.user = { ...session.user, id: adminId, role: 'ADMIN', isOwner: false };
    const row = await createUser({
      email: `${STAMP}-mgr@example.test`,
      fullName: 'Max Manager',
      role: 'MANAGER',
      isOwner: false,
      password: 'Vq7!mZr2#Lp9wXc4',
    });
    createdIds.push(row.id);
    expect(await grantsOf(row.id)).toEqual(presetKeys('MANAGER'));

    await changeUserRole({ userId: row.id, role: 'STAFF' });
    expect(await grantsOf(row.id)).toEqual([]); // STAFF preset is empty — no stale access

    await changeUserRole({ userId: row.id, role: 'FINANCE' });
    expect(await grantsOf(row.id)).toEqual(presetKeys('FINANCE'));

    const audits = await db
      .select({ before: auditEvents.before, after: auditEvents.after })
      .from(auditEvents)
      .where(eq(auditEvents.entityId, row.id));
    const roleChanges = audits.filter(
      (a) => (a.after as { grants?: unknown } | null)?.grants !== undefined,
    );
    expect(roleChanges.length).toBe(2);
  });
});

describe('owner protection', () => {
  it('a non-owner ADMIN cannot change or deactivate an owner', async () => {
    session.user = { ...session.user, id: adminId, role: 'ADMIN', isOwner: false };
    await expect(changeUserRole({ userId: ownerId, role: 'STAFF' })).rejects.toThrow(/owner/i);
    await expect(setUserActive({ userId: ownerId, isActive: false })).rejects.toThrow(/owner/i);
    const [o] = await db.select().from(users).where(eq(users.id, ownerId));
    expect(o?.role).toBe('MANAGER');
    expect(o?.isActive).toBe(true);
  });

  it('an owner who is not ADMIN passes ADMIN-only user management (B1)', async () => {
    session.user = { ...session.user, id: ownerId, role: 'MANAGER', isOwner: true };
    const row = await createUser({
      email: `${STAMP}-byowner@example.test`,
      fullName: 'Owen Created',
      role: 'DOCUMENT_SPECIALIST',
      isOwner: false,
      password: 'Vq7!mZr2#Lp9wXc4',
    });
    createdIds.push(row.id);
    expect(await grantsOf(row.id)).toEqual(presetKeys('DOCUMENT_SPECIALIST'));
  });
});

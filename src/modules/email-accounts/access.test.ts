import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db/client';
import { auditEvents } from '@/lib/db/schema/audit_events';
import { candidateEmailAccounts } from '@/lib/db/schema/email_accounts';
import { persons } from '@/lib/db/schema/persons';
import { type UserRole, users } from '@/lib/db/schema/users';

/**
 * Phase 1 Item 5 (SEC-03) — candidate mailbox credentials are admin
 * authority only (ADMIN, or the owner via B1). Every reveal is audited
 * with its reason and never with the value.
 */

const current = {
  user: {
    id: '',
    email: '',
    name: '',
    role: 'STAFF' as UserRole,
    isOwner: false,
    personId: null,
    employerId: null,
  },
};
vi.mock('@/lib/auth/session', async () => {
  const { roleSatisfies } = await import('@/lib/auth/role-rules');
  const { AuthorizationError } = await import('@/lib/errors');
  return {
    requireInternalStaff: vi.fn(async () => current),
    requireRole: vi.fn(async (roles: UserRole[]) => {
      if (!roleSatisfies(current.user, roles)) throw new AuthorizationError();
      return current;
    }),
  };
});

// CI's test step has no EMAIL_CRED_ENC_KEY; use a throwaway test-only key
// when none is configured (locally .env.local provides the real dev key).
process.env.EMAIL_CRED_ENC_KEY ??= Buffer.alloc(32, 7).toString('base64');

const { upsertEmailAccount, revealPassword, removeEmailAccount } = await import('./service');

const STAMP = `vitest-mailbox-${Date.now()}`;
const SECRET = `Mb-${STAMP}-Zz9!`;
const ids = new Map<string, string>();
let personId = '';

function actAs(key: string, role: UserRole, isOwner = false) {
  current.user = { ...current.user, id: ids.get(key) as string, role, isOwner };
}

beforeAll(async () => {
  for (const [key, role, isOwner] of [
    ['staff', 'STAFF', false],
    ['finance', 'FINANCE', false],
    ['admin', 'ADMIN', false],
    ['owner', 'MANAGER', true],
  ] as const) {
    const [u] = await db
      .insert(users)
      .values({
        email: `${STAMP}-${key}@example.test`,
        fullName: key,
        role,
        isOwner,
        passwordHash: 'x',
      })
      .returning({ id: users.id });
    if (!u) throw new Error('seed failed');
    ids.set(key, u.id);
  }
  const [p] = await db
    .insert(persons)
    .values({
      firstName: 'Mail',
      lastName: STAMP,
      email: `${STAMP}@example.test`,
      source: 'DIRECT',
    })
    .returning({ id: persons.id });
  if (!p) throw new Error('seed failed');
  personId = p.id;
});

afterAll(async () => {
  await db.delete(candidateEmailAccounts).where(eq(candidateEmailAccounts.personId, personId));
  await db.delete(auditEvents).where(inArray(auditEvents.actorUserId, [...ids.values()]));
  await db.delete(persons).where(eq(persons.id, personId));
  await db.delete(users).where(inArray(users.id, [...ids.values()]));
});

const upsert = () =>
  upsertEmailAccount({
    personId,
    emailAddress: `${STAMP}@mail.example.test`,
    password: SECRET,
    provider: 'GMAIL',
    imapSecure: true,
    smtpSecure: true,
    markSharedWithCandidate: false,
  } as Parameters<typeof upsertEmailAccount>[0]);

describe('mailbox credentials are admin authority only', () => {
  it('STAFF and FINANCE cannot store, reveal or delete', async () => {
    for (const [key, role] of [
      ['staff', 'STAFF'],
      ['finance', 'FINANCE'],
    ] as const) {
      actAs(key, role);
      await expect(upsert()).rejects.toMatchObject({ code: 'AUTHORIZATION_ERROR' });
      await expect(revealPassword({ personId, reason: 'support call' })).rejects.toMatchObject({
        code: 'AUTHORIZATION_ERROR',
      });
      await expect(removeEmailAccount({ personId })).rejects.toMatchObject({
        code: 'AUTHORIZATION_ERROR',
      });
    }
  });

  it('ADMIN stores and reveals; the reveal is audited with its reason, never the value', async () => {
    actAs('admin', 'ADMIN');
    await upsert();
    const value = await revealPassword({ personId, reason: 'candidate locked out' });
    expect(value).toBe(SECRET);
    const audits = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.actorUserId, ids.get('admin') as string));
    const reveal = audits.find((a) => a.action === 'PASSWORD_REVEALED');
    expect(reveal).toBeTruthy();
    expect(JSON.stringify(audits)).not.toContain(SECRET);
  });

  it('a non-ADMIN owner holds the same authority (B1) and can delete', async () => {
    actAs('owner', 'MANAGER', true);
    await removeEmailAccount({ personId });
    const left = await db
      .select()
      .from(candidateEmailAccounts)
      .where(eq(candidateEmailAccounts.personId, personId));
    expect(left).toEqual([]);
  });
});

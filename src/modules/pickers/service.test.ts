import { inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db/client';
import { persons } from '@/lib/db/schema/persons';
import { employers } from '@/lib/db/schema/recruitment';
import type { UserRole } from '@/lib/db/schema/users';
import { e2eAdminId } from '@/test/db-fixtures';

/**
 * R2 — server-side pickers: same access rule and row filters as the eager
 * lists they replace, paginated, with literal matching of % and _.
 */

const session = { user: { id: 'x', role: 'STAFF' as UserRole, isOwner: false } };
vi.mock('@/lib/auth/session', async () => {
  const { AuthorizationError } = await import('@/lib/errors');
  const INTERNAL = ['ADMIN', 'STAFF', 'MANAGER', 'RECRUITER', 'DOCUMENT_SPECIALIST', 'FINANCE'];
  return {
    requireInternalStaff: vi.fn(async () => {
      if (!INTERNAL.includes(session.user.role)) throw new AuthorizationError();
      return session;
    }),
  };
});

const { searchPersonsForPicker, searchEmployersForPicker } = await import('./service');

const TAG = `Pk${Date.now().toString(36)}`;
const personIds: string[] = [];
const employerIds: string[] = [];

beforeAll(async () => {
  const rows = await db
    .insert(persons)
    .values([
      ...Array.from({ length: 23 }, (_, i) => ({
        firstName: `${TAG}Active`,
        lastName: `N${String(i).padStart(2, '0')}`,
        source: 'DIRECT' as const,
      })),
      { firstName: `${TAG}Draft`, lastName: 'X', source: 'DIRECT' as const, isDraft: true },
      {
        firstName: `${TAG}Archived`,
        lastName: 'X',
        source: 'DIRECT' as const,
        archivedAt: new Date(),
      },
      { firstName: `${TAG}100%`, lastName: 'Literal', source: 'DIRECT' as const },
    ])
    .returning({ id: persons.id });
  personIds.push(...rows.map((r) => r.id));
  const emps = await db
    .insert(employers)
    .values([
      {
        assignedUserId: await e2eAdminId(),
        legalName: `${TAG} Care Homes Ltd`,
        tradingName: `${TAG} Sunrise`,
      },
      { assignedUserId: await e2eAdminId(), legalName: `${TAG} Old Co`, archivedAt: new Date() },
    ])
    .returning({ id: employers.id });
  employerIds.push(...emps.map((r) => r.id));
});

afterAll(async () => {
  await db.delete(persons).where(inArray(persons.id, personIds));
  await db.delete(employers).where(inArray(employers.id, employerIds));
});

describe('searchPersonsForPicker', () => {
  it('paginates 20 at a time with hasMore', async () => {
    session.user.role = 'RECRUITER';
    const p0 = await searchPersonsForPicker({ query: `${TAG}Active` });
    expect(p0.items).toHaveLength(20);
    expect(p0.hasMore).toBe(true);
    const p1 = await searchPersonsForPicker({ query: `${TAG}Active`, page: 1 });
    expect(p1.items).toHaveLength(3);
    expect(p1.hasMore).toBe(false);
    expect(new Set([...p0.items, ...p1.items].map((p) => p.id)).size).toBe(23);
  });

  it('excludes drafts and archived people (same filter as the old list)', async () => {
    expect((await searchPersonsForPicker({ query: `${TAG}Draft` })).items).toHaveLength(0);
    expect((await searchPersonsForPicker({ query: `${TAG}Archived` })).items).toHaveLength(0);
  });

  it('matches "first last" and treats % literally', async () => {
    expect((await searchPersonsForPicker({ query: `${TAG}Active N07` })).items).toHaveLength(1);
    const lit = await searchPersonsForPicker({ query: `${TAG}100%` });
    expect(lit.items.map((p) => p.lastName)).toEqual(['Literal']);
    expect((await searchPersonsForPicker({ query: `${TAG}1_0%` })).items).toHaveLength(0);
  });

  it('refuses non-internal users and rejects oversized input', async () => {
    session.user.role = 'CANDIDATE';
    await expect(searchPersonsForPicker({ query: TAG })).rejects.toMatchObject({
      code: 'AUTHORIZATION_ERROR',
    });
    session.user.role = 'STAFF';
    await expect(searchPersonsForPicker({ query: 'x'.repeat(101) })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });
});

describe('searchEmployersForPicker', () => {
  it('finds by legal or trading name and hides archived employers', async () => {
    session.user.role = 'STAFF';
    const byTrading = await searchEmployersForPicker({ query: `${TAG} Sunrise` });
    expect(byTrading.items.map((e) => e.legalName)).toEqual([`${TAG} Care Homes Ltd`]);
    const all = await searchEmployersForPicker({ query: TAG });
    expect(all.items.map((e) => e.legalName)).toEqual([`${TAG} Care Homes Ltd`]);
  });

  it('refuses non-internal users', async () => {
    session.user.role = 'EMPLOYER';
    await expect(searchEmployersForPicker({ query: TAG })).rejects.toMatchObject({
      code: 'AUTHORIZATION_ERROR',
    });
    session.user.role = 'STAFF';
  });
});

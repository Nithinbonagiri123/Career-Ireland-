import { describe, expect, it } from 'vitest';
import type { DbExecutor } from '@/lib/audit/withAudit';
import { classifyImmigration, listCandidates } from './repository';

/**
 * Stage 5 — Immigration semantics + N+1 regression coverage.
 *
 * Two concerns live here:
 *
 *  1. The pure classifier that maps (immigration_cases.status, expires_on)
 *     to the UI's six-state immigrationKind — exercised exhaustively so
 *     the card can trust the field without re-deriving it.
 *
 *  2. A query-count regression test: listCandidates must issue exactly
 *     5 round-trips for a page of N candidates, regardless of N. If a
 *     future edit reintroduces an N+1 (per-row immigration lookup, per-row
 *     count, etc.) the exec counter here will fail long before CI load
 *     test or a production slow query would catch it.
 */

describe('classifyImmigration', () => {
  const today = '2026-10-17';

  it('returns NONE for null/undefined/empty', () => {
    expect(classifyImmigration(undefined, today)).toBe('NONE');
    expect(classifyImmigration(null, today)).toBe('NONE');
    expect(classifyImmigration({ status: null, expiresOn: null }, today)).toBe('NONE');
  });

  it('APPROVED with no expiry → CURRENT_PERMISSION (permit without expiry)', () => {
    expect(classifyImmigration({ status: 'APPROVED', expiresOn: null }, today)).toBe(
      'CURRENT_PERMISSION',
    );
  });

  it('APPROVED with future expiry → CURRENT_PERMISSION', () => {
    const future = new Date('2027-06-01T00:00:00Z');
    expect(classifyImmigration({ status: 'APPROVED', expiresOn: future }, today)).toBe(
      'CURRENT_PERMISSION',
    );
  });

  it('APPROVED expiring today → EXPIRED_PERMISSION (strict > comparison)', () => {
    // Permission ends on expiry date in Irish immigration — must renew that
    // day. A card showing "current permission, expires today" would be
    // misleading, so same-day counts as expired.
    const today0 = new Date('2026-10-17T00:00:00Z');
    expect(classifyImmigration({ status: 'APPROVED', expiresOn: today0 }, today)).toBe(
      'EXPIRED_PERMISSION',
    );
  });

  it('APPROVED with past expiry → EXPIRED_PERMISSION', () => {
    const past = new Date('2025-01-01T00:00:00Z');
    expect(classifyImmigration({ status: 'APPROVED', expiresOn: past }, today)).toBe(
      'EXPIRED_PERMISSION',
    );
  });

  it('all in-flight statuses → PENDING_CASE', () => {
    for (const status of ['OPEN', 'DOCUMENTS_PENDING', 'SUBMITTED', 'UNDER_AUTHORITY_REVIEW']) {
      expect(classifyImmigration({ status: status as 'OPEN', expiresOn: null }, today)).toBe(
        'PENDING_CASE',
      );
    }
  });

  it('REJECTED → REJECTED_CASE (never presented as a current permission)', () => {
    expect(classifyImmigration({ status: 'REJECTED', expiresOn: null }, today)).toBe(
      'REJECTED_CASE',
    );
    // Even if expires_on is populated for a rejected case, the kind stays
    // REJECTED_CASE — a rejected case never confers permission.
    expect(
      classifyImmigration(
        { status: 'REJECTED', expiresOn: new Date('2027-01-01T00:00:00Z') },
        today,
      ),
    ).toBe('REJECTED_CASE');
  });

  it('CLOSED → CLOSED_CASE', () => {
    expect(classifyImmigration({ status: 'CLOSED', expiresOn: null }, today)).toBe('CLOSED_CASE');
  });
});

/**
 * Minimal Drizzle-shaped mock for the main listCandidates SELECT. The real
 * chain is `.select().from().innerJoin().leftJoin().leftJoin().where()
 * .orderBy()` and is awaited. Returning the same proxy from every chain
 * method keeps the mock small; the `then` on the final step resolves to
 * the row array.
 */
function makeChainable(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = self;
  chain.from = self;
  chain.innerJoin = self;
  chain.leftJoin = self;
  chain.where = self;
  chain.orderBy = self;
  // Make the chain thenable so `await chain.select().from()...orderBy()`
  // resolves to rows. Drizzle's real query builder is also thenable —
  // that's precisely the shape we're emulating here.
  // biome-ignore lint/suspicious/noThenProperty: intentional thenable mock of Drizzle's query builder
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(rows).then(resolve);
  return chain as unknown as DbExecutor;
}

describe('listCandidates query cost (N+1 regression)', () => {
  it('issues 1 main SELECT + 4 batched execute() calls regardless of N', async () => {
    const N = 100;
    const mockRows = Array.from({ length: N }, (_, i) => ({
      candidateProfileId: `cp-${i}`,
      personId: `p-${i}`,
      firstName: 'First',
      lastName: 'Last',
      email: null,
      phone: null,
      currentCity: null,
      currentCountry: null,
      primaryOccupationName: null,
      lifecycleStatus: 'ACTIVE' as const,
      availabilityStatus: 'AVAILABLE' as const,
      activatedAt: new Date(),
      createdAt: new Date(),
      assignedUserId: null,
      assignedUserName: null,
    }));

    const chain = makeChainable(mockRows);
    let executeCalls = 0;
    const executor = new Proxy(chain, {
      get(target, prop, receiver) {
        if (prop === 'execute') {
          return async () => {
            executeCalls += 1;
            // Empty rows → the result maps all persons to count=0, which
            // is fine for the structural test.
            return [] as never;
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    }) as DbExecutor;

    const result = await listCandidates({ executor });

    // 4 batched IN() lookups — immigration + applications + shortlists +
    // placements. The main SELECT uses the drizzle query builder, not
    // execute(), so it doesn't bump this counter.
    expect(executeCalls).toBe(4);
    expect(result).toHaveLength(N);
    // Every row got the batched defaults — no row-level fallback query.
    expect(result[0]?.immigrationKind).toBe('NONE');
    expect(result[0]?.applicationsCount).toBe(0);
    expect(result[0]?.shortlistsCount).toBe(0);
    expect(result[0]?.placementsCount).toBe(0);
  });

  it('skips the 4 batched queries entirely when the main SELECT returns 0 rows', async () => {
    const chain = makeChainable([]);
    let executeCalls = 0;
    const executor = new Proxy(chain, {
      get(target, prop, receiver) {
        if (prop === 'execute') {
          return async () => {
            executeCalls += 1;
            return [] as never;
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    }) as DbExecutor;

    const result = await listCandidates({ executor });

    expect(result).toHaveLength(0);
    // No persons → no IN() lookups. Saves 4 round-trips on empty pages.
    expect(executeCalls).toBe(0);
  });
});

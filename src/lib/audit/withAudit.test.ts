import { describe, expect, it } from 'vitest';
import type { AuditContext, DbExecutor } from './withAudit';
import { recordAudit, recordRevert } from './withAudit';

/**
 * Unit test for the audit helper using an in-memory fake executor.
 * Full DB atomicity is covered by an integration test once Testcontainers is wired up.
 */
type FakeInsertBuilder = {
  values: (v: unknown) => { returning: () => Promise<Array<Record<string, unknown>>> };
};

function makeExecutor(): {
  exec: DbExecutor;
  calls: Array<{ table: unknown; values: unknown }>;
} {
  const calls: Array<{ table: unknown; values: unknown }> = [];
  const exec = {
    insert(table: unknown): FakeInsertBuilder {
      return {
        values(values) {
          calls.push({ table, values });
          return {
            async returning() {
              return [
                {
                  id: '00000000-0000-0000-0000-000000000001',
                  occurredAt: new Date(),
                  ...(values as Record<string, unknown>),
                },
              ];
            },
          };
        },
      };
    },
    // biome-ignore lint/suspicious/noExplicitAny: minimal fake executor
  } as any;
  return { exec, calls };
}

const baseCtx: AuditContext = {
  actorUserId: '00000000-0000-0000-0000-000000000abc',
  entityType: 'user',
  entityId: '00000000-0000-0000-0000-000000000def',
  action: 'UPDATED',
  before: { role: 'STAFF' },
  after: { role: 'ADMIN' },
};

describe('recordAudit', () => {
  it('writes to audit_events via the passed executor', async () => {
    const { exec, calls } = makeExecutor();
    await recordAudit(exec, baseCtx);
    expect(calls.length).toBe(1);
    const values = calls[0]?.values as Record<string, unknown>;
    expect(values.entityType).toBe('user');
    expect(values.action).toBe('UPDATED');
    expect(values.before).toEqual({ role: 'STAFF' });
    expect(values.after).toEqual({ role: 'ADMIN' });
  });

  it('defaults optional fields to null', async () => {
    const { exec, calls } = makeExecutor();
    await recordAudit(exec, {
      actorUserId: null,
      entityType: 'user',
      entityId: '00000000-0000-0000-0000-000000000def',
      action: 'CREATED',
    });
    const values = calls[0]?.values as Record<string, unknown>;
    expect(values.before).toBeNull();
    expect(values.after).toBeNull();
    expect(values.context).toBeNull();
  });
});

describe('recordRevert', () => {
  it('creates a new event with swapped before/after and revertsEventId link', async () => {
    const { exec, calls } = makeExecutor();
    await recordRevert(exec, {
      actorUserId: '00000000-0000-0000-0000-000000000abc',
      revertedEvent: {
        id: '00000000-0000-0000-0000-000000000111',
        entityType: 'user',
        entityId: '00000000-0000-0000-0000-000000000def',
        before: { role: 'STAFF' },
        after: { role: 'ADMIN' },
      },
      reason: 'wrong role assigned',
    });
    const values = calls[0]?.values as Record<string, unknown>;
    expect(values.action).toBe('REVERTED');
    expect(values.revertsEventId).toBe('00000000-0000-0000-0000-000000000111');
    // Swap: the revert restores the original state, so its 'after' is the original 'before'.
    expect(values.before).toEqual({ role: 'ADMIN' });
    expect(values.after).toEqual({ role: 'STAFF' });
    expect(values.context).toEqual({ reason: 'wrong role assigned' });
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthorizationError } from '@/lib/errors';
import { encodeKey, hasPermission, presetForRole, type Role } from './permissions';

const requireAnyPermission = vi.fn();
const checkPermission = vi.fn();
vi.mock('./session', () => ({
  requireAnyPermission: (...a: unknown[]) => requireAnyPermission(...a),
  checkPermission: (...a: unknown[]) => checkPermission(...a),
}));

const { FINANCE_READ_PERMISSIONS, canReadFinance, financeReadDeniedResponse } = await import(
  './finance-read'
);

function presetAllows(role: Role): boolean {
  const granted = new Set(presetForRole(role).map((k) => encodeKey(k.business, k.module, k.verb)));
  return FINANCE_READ_PERMISSIONS.some((p) => hasPermission(granted, p.business, p.module, p.verb));
}

describe('finance read policy (payments + revenue exports)', () => {
  beforeEach(() => {
    requireAnyPermission.mockReset();
    checkPermission.mockReset();
  });

  it('is exactly the /payments page gate — no new grants', () => {
    expect(FINANCE_READ_PERMISSIONS).toEqual([
      { business: 'candidate_services', module: 'payments', verb: 'view' },
      { business: 'main', module: 'accounts', verb: 'view' },
    ]);
  });

  it.each([
    ['ADMIN', true],
    ['FINANCE', true],
    ['MANAGER', true],
    ['STAFF', false],
    ['RECRUITER', false],
    ['DOCUMENT_SPECIALIST', false],
    ['CANDIDATE', false],
    ['EMPLOYER', false],
  ] as const)('%s preset → %s', (role, allowed) => {
    expect(presetAllows(role)).toBe(allowed);
  });

  it('returns a 403 with no data when the permission check refuses', async () => {
    requireAnyPermission.mockRejectedValueOnce(new AuthorizationError());
    const r = await financeReadDeniedResponse();
    expect(r?.status).toBe(403);
    expect(await r?.text()).toBe('Forbidden');
    expect(r?.headers.get('content-type')).toContain('text/plain');
    expect(requireAnyPermission).toHaveBeenCalledWith([...FINANCE_READ_PERMISSIONS]);
  });

  it('returns null (allow) when the permission check passes', async () => {
    requireAnyPermission.mockResolvedValueOnce({ user: { id: 'u' } });
    expect(await financeReadDeniedResponse()).toBeNull();
  });

  it('does not swallow unexpected errors', async () => {
    requireAnyPermission.mockRejectedValueOnce(new Error('db down'));
    await expect(financeReadDeniedResponse()).rejects.toThrow('db down');
  });

  it('canReadFinance is true when either grant is held, false otherwise', async () => {
    checkPermission.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    expect(await canReadFinance()).toBe(true);
    checkPermission.mockResolvedValue(false);
    expect(await canReadFinance()).toBe(false);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Stage 6B+2 — server-side authorization proof.
 *
 * The user-facing UI hides finance actions (Verify, Refund, Void, Issue
 * Credit Note) from STAFF-role operators, but a server-side gate must
 * remain effective even if someone POSTs the action directly. These
 * tests mock the session so the modules can be exercised without a live
 * browser, and assert that each finance-only path throws
 * AuthorizationError when the acting user is STAFF.
 *
 * We only mock the auth layer. The underlying services, Drizzle schema,
 * and error types stay real so a change to the role list or the error
 * shape surfaces here immediately.
 */

const mockRequireRole = vi.fn();
const mockRequireInternalStaff = vi.fn();
const mockRequirePermission = vi.fn();
// Stub the whole session module so vitest doesn't pull next-auth into the
// unit test graph. We provide just the surface the billing/proformas
// services call. The INTERNAL_STAFF_ROLES constant is re-exported verbatim
// because consumers import it as a value.
vi.mock('@/lib/auth/session', () => ({
  requireRole: mockRequireRole,
  requireInternalStaff: mockRequireInternalStaff,
  requirePermission: mockRequirePermission,
  INTERNAL_STAFF_ROLES: [
    'ADMIN',
    'STAFF',
    'MANAGER',
    'RECRUITER',
    'DOCUMENT_SPECIALIST',
    'FINANCE',
  ] as const,
  getSession: vi.fn(),
  requireSession: vi.fn(),
}));

describe('finance-only server actions reject STAFF-role callers', () => {
  const STAFF_SESSION = {
    user: {
      id: 'staff-user-id',
      email: 'staff@example.test',
      name: 'Staff',
      role: 'STAFF',
      personId: null,
      employerId: null,
      isOwner: false,
    },
  } as const;

  beforeEach(() => {
    // Default behaviour mirrors the real `requireRole`: throw if STAFF
    // is passed an admin/finance-only gate; return the session otherwise.
    mockRequireRole.mockImplementation(async (roles: string[]) => {
      if (!roles.includes(STAFF_SESSION.user.role)) {
        const { AuthorizationError } = await import('@/lib/errors');
        throw new AuthorizationError('Insufficient role.');
      }
      return STAFF_SESSION;
    });
  });

  afterEach(() => {
    mockRequireRole.mockReset();
  });

  it('voidInvoice rejects STAFF', async () => {
    const { voidInvoice } = await import('@/modules/billing/service');
    await expect(voidInvoice('00000000-0000-0000-0000-000000000000', 'test')).rejects.toThrow(
      /insufficient role/i,
    );
    expect(mockRequireRole).toHaveBeenCalledWith(['ADMIN', 'FINANCE']);
  });

  it('issueCreditNote rejects STAFF', async () => {
    const { issueCreditNote } = await import('@/modules/billing/service');
    await expect(
      issueCreditNote({
        invoiceId: '00000000-0000-0000-0000-000000000000',
        amount: '10.00',
        reason: 'test',
      }),
    ).rejects.toThrow(/insufficient role/i);
    expect(mockRequireRole).toHaveBeenCalledWith(['ADMIN', 'FINANCE']);
  });

  it('issueRefund rejects STAFF', async () => {
    const { issueRefund } = await import('@/modules/billing/service');
    await expect(
      issueRefund({
        paymentId: '00000000-0000-0000-0000-000000000000',
        amount: '10.00',
        method: 'BANK_TRANSFER',
        reason: 'test',
      }),
    ).rejects.toThrow(/insufficient role/i);
    expect(mockRequireRole).toHaveBeenCalledWith(['ADMIN', 'FINANCE']);
  });
});

describe('finance-only server actions accept FINANCE-role callers past the gate', () => {
  // We swap in a FINANCE session and assert the gate check itself PASSES
  // (i.e. doesn't throw AuthorizationError). The service then proceeds
  // to its DB work and may throw a BusinessRuleError (e.g. INVOICE_NOT_FOUND)
  // because our test IDs don't correspond to real rows — that failure
  // proves the gate let the caller through.

  const FINANCE_SESSION = {
    user: {
      id: 'finance-user-id',
      email: 'finance@example.test',
      name: 'Finance',
      role: 'FINANCE',
      personId: null,
      employerId: null,
      isOwner: false,
    },
  } as const;

  beforeEach(() => {
    mockRequireRole.mockImplementation(async (roles: string[]) => {
      if (!roles.includes(FINANCE_SESSION.user.role)) {
        const { AuthorizationError } = await import('@/lib/errors');
        throw new AuthorizationError('Insufficient role.');
      }
      return FINANCE_SESSION;
    });
  });

  afterEach(() => {
    mockRequireRole.mockReset();
  });

  it('voidInvoice lets FINANCE past the role gate', async () => {
    const { voidInvoice } = await import('@/modules/billing/service');
    // No matching invoice → BusinessRuleError, NOT AuthorizationError.
    await expect(voidInvoice('00000000-0000-0000-0000-000000000000', 'test')).rejects.toThrow(
      /invoice not found/i,
    );
    expect(mockRequireRole).toHaveBeenCalledWith(['ADMIN', 'FINANCE']);
  });
});

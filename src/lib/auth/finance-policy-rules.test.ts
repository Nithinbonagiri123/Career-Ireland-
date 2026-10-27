import { describe, expect, it } from 'vitest';
import type { UserRole } from '@/lib/db/schema/users';
import { FINANCE_TIERS, type FinanceTier, hasFinanceAuthority } from './finance-policy-rules';

/**
 * Exhaustive role × owner × tier matrix for the central finance policy.
 * Every cell is asserted explicitly, so any change to who may prepare,
 * issue, verify or reverse money shows up as a failing row here.
 */

const INTERNAL: UserRole[] = [
  'STAFF',
  'RECRUITER',
  'DOCUMENT_SPECIALIST',
  'MANAGER',
  'FINANCE',
  'ADMIN',
];
const FINANCE_ROLES: UserRole[] = ['FINANCE', 'ADMIN'];

function expected(role: UserRole, isOwner: boolean, tier: FinanceTier): boolean {
  const internal = INTERNAL.includes(role);
  if (!internal) return false;
  if (tier === 'PREPARE') return true;
  return isOwner || FINANCE_ROLES.includes(role);
}

describe('finance policy matrix', () => {
  for (const role of [...INTERNAL, 'CANDIDATE', 'EMPLOYER'] as UserRole[]) {
    for (const isOwner of [false, true]) {
      for (const tier of FINANCE_TIERS) {
        const allow = expected(role, isOwner, tier);
        it(`${role}${isOwner ? ' + owner' : ''} → ${tier}: ${allow ? 'allow' : 'deny'}`, () => {
          expect(hasFinanceAuthority({ role, isOwner }, tier)).toBe(allow);
        });
      }
    }
  }

  it('a deactivated user holds no authority at any tier, even as owner + ADMIN', () => {
    for (const tier of FINANCE_TIERS) {
      expect(hasFinanceAuthority({ role: 'ADMIN', isOwner: true, isActive: false }, tier)).toBe(
        false,
      );
    }
  });

  it('the non-finance staff roles are denied every privileged tier', () => {
    for (const role of ['STAFF', 'RECRUITER', 'DOCUMENT_SPECIALIST', 'MANAGER'] as UserRole[]) {
      for (const tier of ['ISSUE', 'VERIFY', 'REVERSE'] as FinanceTier[]) {
        expect(hasFinanceAuthority({ role, isOwner: false }, tier)).toBe(false);
      }
    }
  });
});

import { describe, expect, it } from 'vitest';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/password-policy';
import { AcceptInvitationSchema, InviteCandidateSchema, InviteEmployerSchema } from './schemas';

const UUID = '11111111-1111-4111-8111-111111111111';

describe('InviteCandidateSchema', () => {
  it('accepts a valid candidate invitation payload', () => {
    expect(
      InviteCandidateSchema.safeParse({
        personId: UUID,
        email: 'p@example.com',
        fullName: 'Priya Patel',
      }).success,
    ).toBe(true);
  });

  it.each([
    { personId: 'not-a-uuid', email: 'p@example.com', fullName: 'Priya' },
    { personId: UUID, email: 'not-an-email', fullName: 'Priya' },
    { personId: UUID, email: 'p@example.com', fullName: 'x' }, // too short
    { personId: UUID, email: 'p@example.com', fullName: 'a'.repeat(201) },
    { personId: UUID, email: `${'a'.repeat(200)}@x.com`, fullName: 'Priya' },
  ])('rejects invalid input: %j', (bad) => {
    expect(InviteCandidateSchema.safeParse(bad).success).toBe(false);
  });
});

describe('InviteEmployerSchema', () => {
  it('accepts a valid employer invitation payload', () => {
    expect(
      InviteEmployerSchema.safeParse({
        employerId: UUID,
        email: 'hr@acme.com',
        fullName: 'Acme HR',
      }).success,
    ).toBe(true);
  });

  it('rejects missing employerId', () => {
    expect(InviteEmployerSchema.safeParse({ email: 'x@y.com', fullName: 'Ok Name' }).success).toBe(
      false,
    );
  });
});

describe('AcceptInvitationSchema', () => {
  const goodPassword = 'Correct-Horse-Battery-Staple-42';

  it('accepts a valid token+password pair', () => {
    expect(
      AcceptInvitationSchema.safeParse({ token: 'x'.repeat(43), password: goodPassword }).success,
    ).toBe(true);
  });

  it('rejects tokens shorter than the minimum (10)', () => {
    expect(
      AcceptInvitationSchema.safeParse({ token: 'short', password: goodPassword }).success,
    ).toBe(false);
  });

  it('rejects tokens longer than the maximum (64)', () => {
    expect(
      AcceptInvitationSchema.safeParse({ token: 'x'.repeat(65), password: goodPassword }).success,
    ).toBe(false);
  });

  it('rejects passwords shorter than the policy minimum', () => {
    expect(
      AcceptInvitationSchema.safeParse({
        token: 'x'.repeat(43),
        password: 'abc',
      }).success,
    ).toBe(false);
  });

  it('accepts passwords right at MIN_PASSWORD_LENGTH (schema-level; policy checked server-side)', () => {
    // The schema only checks length; contextual policy (name/email substrings) is server-side.
    const pw = 'Abcdefgh12!'.padEnd(MIN_PASSWORD_LENGTH, 'x');
    expect(AcceptInvitationSchema.safeParse({ token: 'x'.repeat(43), password: pw }).success).toBe(
      true,
    );
  });
});

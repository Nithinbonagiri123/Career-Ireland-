import { describe, expect, it } from 'vitest';
import { CreateLeadForNewPersonSchema, LeadStatusSchema } from './schemas';

/**
 * Stage 1 regression + contract tests for lead creation Zod schemas.
 *
 * Scope:
 *   - CS lead creation enforces the new strict field set (email, phone,
 *     address_line_1, country, city, primary_occupation_id).
 *   - Immigration lead creation stays loose — same schema, no additional
 *     requirements, no breakage.
 *   - Middle name stays optional for every business line.
 *   - EXPIRED lead status is accepted in the status enum.
 */

const CS_HAPPY_PERSON = {
  firstName: 'Nikki',
  lastName: 'Bonagiri',
  email: 'nikki@example.com',
  phone: '+353871234567',
  currentCountry: 'Ireland',
  currentCity: 'Dublin',
  addressLine1: '12 Main Street',
  primaryOccupationId: '11111111-1111-4111-8111-111111111111',
  source: 'DIRECT' as const,
};

describe('CreateLeadForNewPersonSchema — CS strict validation', () => {
  it('accepts a complete CS lead', () => {
    const r = CreateLeadForNewPersonSchema.safeParse({
      mode: 'NEW_PERSON',
      targetBusiness: 'CANDIDATE_SERVICES',
      person: CS_HAPPY_PERSON,
    });
    expect(r.success).toBe(true);
  });

  it('accepts a CS lead with middle name', () => {
    const r = CreateLeadForNewPersonSchema.safeParse({
      mode: 'NEW_PERSON',
      targetBusiness: 'CANDIDATE_SERVICES',
      person: { ...CS_HAPPY_PERSON, middleName: 'Ann' },
    });
    expect(r.success).toBe(true);
  });

  it('accepts a CS lead WITHOUT middle name (optional)', () => {
    const { middleName: _m, ...withoutMiddle } = CS_HAPPY_PERSON as unknown as Record<
      string,
      unknown
    >;
    const r = CreateLeadForNewPersonSchema.safeParse({
      mode: 'NEW_PERSON',
      targetBusiness: 'CANDIDATE_SERVICES',
      person: withoutMiddle,
    });
    expect(r.success).toBe(true);
  });

  it('rejects a CS lead missing email', () => {
    const r = CreateLeadForNewPersonSchema.safeParse({
      mode: 'NEW_PERSON',
      targetBusiness: 'CANDIDATE_SERVICES',
      person: { ...CS_HAPPY_PERSON, email: '' },
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.join('.') === 'person.email')).toBe(true);
    }
  });

  it('rejects a CS lead missing phone', () => {
    const r = CreateLeadForNewPersonSchema.safeParse({
      mode: 'NEW_PERSON',
      targetBusiness: 'CANDIDATE_SERVICES',
      person: { ...CS_HAPPY_PERSON, phone: '' },
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.join('.') === 'person.phone')).toBe(true);
    }
  });

  it('rejects a CS lead missing primary profession', () => {
    const r = CreateLeadForNewPersonSchema.safeParse({
      mode: 'NEW_PERSON',
      targetBusiness: 'CANDIDATE_SERVICES',
      person: { ...CS_HAPPY_PERSON, primaryOccupationId: '' },
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.join('.') === 'person.primaryOccupationId')).toBe(
        true,
      );
    }
  });

  it('accepts a CS lead with no address line 1 (Stage 6E Section 4 — now optional)', () => {
    const r = CreateLeadForNewPersonSchema.safeParse({
      mode: 'NEW_PERSON',
      targetBusiness: 'CANDIDATE_SERVICES',
      person: { ...CS_HAPPY_PERSON, addressLine1: '' },
    });
    expect(r.success).toBe(true);
  });

  it('rejects a CS lead missing country of residence', () => {
    const r = CreateLeadForNewPersonSchema.safeParse({
      mode: 'NEW_PERSON',
      targetBusiness: 'CANDIDATE_SERVICES',
      person: { ...CS_HAPPY_PERSON, currentCountry: '' },
    });
    expect(r.success).toBe(false);
  });

  it('accepts a CS lead with no city (Stage 6E Section 4 — now optional)', () => {
    const r = CreateLeadForNewPersonSchema.safeParse({
      mode: 'NEW_PERSON',
      targetBusiness: 'CANDIDATE_SERVICES',
      person: { ...CS_HAPPY_PERSON, currentCity: '' },
    });
    expect(r.success).toBe(true);
  });

  it('rejects a CS lead with a non-E.164 phone (Stage 6E Section 4)', () => {
    const r = CreateLeadForNewPersonSchema.safeParse({
      mode: 'NEW_PERSON',
      targetBusiness: 'CANDIDATE_SERVICES',
      person: { ...CS_HAPPY_PERSON, phone: '08712345' },
    });
    expect(r.success).toBe(false);
  });

  it('accepts a CS lead with any valid E.164 phone (any country prefix)', () => {
    for (const phone of ['+353871234567', '+27821234567', '+919876543210', '+447911123456']) {
      const r = CreateLeadForNewPersonSchema.safeParse({
        mode: 'NEW_PERSON',
        targetBusiness: 'CANDIDATE_SERVICES',
        person: { ...CS_HAPPY_PERSON, phone },
      });
      expect(r.success).toBe(true);
    }
  });
});

describe('CreateLeadForNewPersonSchema — Immigration stays loose (regression)', () => {
  it('accepts an Immigration lead with ONLY first + last name + source', () => {
    const r = CreateLeadForNewPersonSchema.safeParse({
      mode: 'NEW_PERSON',
      targetBusiness: 'IMMIGRATION',
      person: {
        firstName: 'Jane',
        lastName: 'Doe',
        source: 'DIRECT',
      },
    });
    expect(r.success).toBe(true);
  });

  it('accepts an Immigration lead without profession / address / phone', () => {
    const r = CreateLeadForNewPersonSchema.safeParse({
      mode: 'NEW_PERSON',
      targetBusiness: 'IMMIGRATION',
      person: {
        firstName: 'John',
        lastName: 'Smith',
        email: 'js@example.com',
        source: 'REFERRAL',
      },
    });
    expect(r.success).toBe(true);
  });
});

describe('LeadStatusSchema — EXPIRED status added', () => {
  it('accepts the new EXPIRED status', () => {
    expect(LeadStatusSchema.safeParse('EXPIRED').success).toBe(true);
  });

  it('still accepts all legacy statuses', () => {
    for (const s of [
      'NEW',
      'CONTACTED',
      'AWAITING_PAYMENT',
      'CONVERTED',
      'LOST',
      'REJECTED',
    ] as const) {
      expect(LeadStatusSchema.safeParse(s).success).toBe(true);
    }
  });

  it('rejects an unknown status', () => {
    expect(LeadStatusSchema.safeParse('DELETED').success).toBe(false);
  });
});

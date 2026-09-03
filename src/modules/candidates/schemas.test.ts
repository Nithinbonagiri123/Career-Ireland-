import { describe, expect, it } from 'vitest';
import { BulkAssignCandidatesSchema, BulkUpdateLifecycleSchema } from './schemas';

/**
 * Regression tests for the deep-audit finding that bulk candidate actions
 * accepted raw string[] input with no zod validation, letting malformed UUIDs
 * or invalid lifecycle enum values reach the database (surfacing as generic
 * INTERNAL_ERROR to the user).
 */

const validUuid = '11111111-1111-4111-a111-111111111111';
const validUuid2 = '22222222-2222-4222-a222-222222222222';

describe('BulkAssignCandidatesSchema', () => {
  it('accepts valid input with UUIDs and either userId=uuid or userId=null', () => {
    expect(
      BulkAssignCandidatesSchema.parse({
        personIds: [validUuid, validUuid2],
        userId: validUuid,
      }),
    ).toEqual({ personIds: [validUuid, validUuid2], userId: validUuid });

    expect(BulkAssignCandidatesSchema.parse({ personIds: [validUuid], userId: null })).toEqual({
      personIds: [validUuid],
      userId: null,
    });
  });

  it('rejects empty personIds array', () => {
    expect(BulkAssignCandidatesSchema.safeParse({ personIds: [], userId: null }).success).toBe(
      false,
    );
  });

  it('rejects malformed UUID in personIds', () => {
    const result = BulkAssignCandidatesSchema.safeParse({
      personIds: [validUuid, 'not-a-uuid'],
      userId: null,
    });
    expect(result.success).toBe(false);
  });

  it('rejects malformed UUID in userId', () => {
    const result = BulkAssignCandidatesSchema.safeParse({
      personIds: [validUuid],
      userId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects >200 personIds (matches MAX_BULK_SIZE)', () => {
    const many = Array.from({ length: 201 }, () => validUuid);
    expect(BulkAssignCandidatesSchema.safeParse({ personIds: many, userId: null }).success).toBe(
      false,
    );
  });

  it('accepts exactly 200 personIds (boundary)', () => {
    const boundary = Array.from({ length: 200 }, () => validUuid);
    expect(
      BulkAssignCandidatesSchema.safeParse({ personIds: boundary, userId: null }).success,
    ).toBe(true);
  });
});

describe('BulkUpdateLifecycleSchema', () => {
  it('accepts the three valid lifecycle values', () => {
    for (const status of ['ACTIVE', 'INACTIVE', 'ARCHIVED'] as const) {
      expect(
        BulkUpdateLifecycleSchema.parse({ personIds: [validUuid], lifecycleStatus: status }),
      ).toEqual({ personIds: [validUuid], lifecycleStatus: status });
    }
  });

  it('rejects an unknown lifecycle string', () => {
    const result = BulkUpdateLifecycleSchema.safeParse({
      personIds: [validUuid],
      lifecycleStatus: 'DELETED',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty personIds array', () => {
    expect(
      BulkUpdateLifecycleSchema.safeParse({ personIds: [], lifecycleStatus: 'ACTIVE' }).success,
    ).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { assertKeyBelongsToOwner } from './key-ownership';

const OWNER = '7b1e2f30-0000-4000-a000-000000000001';
const OTHER = '7b1e2f30-0000-4000-a000-000000000002';

describe('assertKeyBelongsToOwner — Stage B Wave 1 storage-key guard', () => {
  it('accepts a key under the owner prefix', () => {
    expect(() =>
      assertKeyBelongsToOwner('PERSON', OWNER, `2026/10/person/${OWNER}/doctype/uuid-cv.pdf`),
    ).not.toThrow();
    expect(() =>
      assertKeyBelongsToOwner('EMPLOYER', OWNER, `2026/10/employer/${OWNER}/doctype/uuid-x.pdf`),
    ).not.toThrow();
  });

  it("rejects another owner's key", () => {
    expect(() =>
      assertKeyBelongsToOwner('PERSON', OWNER, `2026/10/person/${OTHER}/doctype/uuid-cv.pdf`),
    ).toThrow(/does not belong/);
  });

  it('rejects an owner-type mismatch', () => {
    expect(() =>
      assertKeyBelongsToOwner('PERSON', OWNER, `2026/10/employer/${OWNER}/doctype/uuid-cv.pdf`),
    ).toThrow(/does not belong/);
  });

  it('rejects keys outside the dated layout entirely', () => {
    expect(() => assertKeyBelongsToOwner('PERSON', OWNER, `person/${OWNER}/file.pdf`)).toThrow();
    expect(() =>
      assertKeyBelongsToOwner('PERSON', OWNER, `../2026/10/person/${OWNER}/x.pdf`),
    ).toThrow();
  });
});

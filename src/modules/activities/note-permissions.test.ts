import { describe, expect, it } from 'vitest';
import { canModifyNote } from './note-permissions';

// Stage B Wave 3 — candidate Notes permission matrix: any staff can add,
// but editing/archiving an INTERNAL_NOTE is author-or-admin only. Other
// communication types keep the pre-Wave-3 any-internal-staff behaviour.
describe('canModifyNote', () => {
  const note = { type: 'INTERNAL_NOTE', staffUserId: 'author-1' };
  const staff = (userId: string) => ({ userId, role: 'STAFF', isOwner: false });

  it('lets the author modify their own note', () => {
    expect(canModifyNote(note, staff('author-1'))).toBe(true);
  });

  it('blocks a different staff member from modifying the note', () => {
    expect(canModifyNote(note, staff('someone-else'))).toBe(false);
  });

  it('lets an ADMIN modify any note', () => {
    expect(canModifyNote(note, { userId: 'admin-1', role: 'ADMIN', isOwner: false })).toBe(true);
  });

  it('lets the account owner modify any note regardless of role', () => {
    expect(canModifyNote(note, { userId: 'owner-1', role: 'STAFF', isOwner: true })).toBe(true);
  });

  it('other communication types are not restricted to the author', () => {
    for (const type of ['EMAIL', 'PHONE', 'MEETING', 'OTHER']) {
      expect(canModifyNote({ type, staffUserId: 'author-1' }, staff('someone-else'))).toBe(true);
    }
  });
});

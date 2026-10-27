import { describe, expect, it } from 'vitest';
import { buildSeatModel, type SeatPlacementInput } from './seats';

let n = 0;
function p(
  personId: string,
  status: SeatPlacementInput['status'],
  extra: Partial<SeatPlacementInput> = {},
): SeatPlacementInput {
  n += 1;
  return {
    id: `pl-${n}`,
    personId,
    personName: `Person ${personId}`,
    status,
    startDate: '2026-11-01',
    createdAt: new Date(Date.UTC(2026, 0, n)),
    ...extra,
  };
}

describe('buildSeatModel — R2 seats are derived from R0 capacity rules', () => {
  it('empty requisition: every position is a derived open row', () => {
    const m = buildSeatModel(3, []);
    expect(m).toMatchObject({ required: 3, filled: 0, remaining: 3, overfilledBy: 0 });
    expect(m.seats.map((s) => s.kind)).toEqual(['open', 'open', 'open']);
  });

  it('only CONFIRMED / STARTED / COMPLETED hold seats (same rule as countSeatsFilled)', () => {
    const m = buildSeatModel(4, [
      p('a', 'CONFIRMED'),
      p('b', 'STARTED'),
      p('c', 'COMPLETED'),
      p('d', 'PROPOSED'),
      p('e', 'TERMINATED_EARLY'),
    ]);
    expect(m.filled).toBe(3);
    expect(m.remaining).toBe(1);
    expect(m.seats.map((s) => s.kind)).toEqual(['filled', 'filled', 'filled', 'open']);
    expect(m.notHoldingSeat.map((r) => r.reason)).toEqual(['proposed', 'ended_early']);
  });

  it('archived placements never count', () => {
    const m = buildSeatModel(1, [p('a', 'CONFIRMED', { archivedAt: new Date() })]);
    expect(m.filled).toBe(0);
    expect(m.seats.map((s) => s.kind)).toEqual(['open']);
  });

  it('capacity is per distinct person; a second seat-holding row for the same person is flagged', () => {
    const m = buildSeatModel(2, [p('a', 'CONFIRMED'), p('a', 'STARTED')]);
    expect(m.filled).toBe(1);
    expect(m.remaining).toBe(1);
    expect(m.notHoldingSeat).toHaveLength(1);
    expect(m.notHoldingSeat[0]?.reason).toBe('duplicate_person');
  });

  it('historical overfill is shown in full, never truncated, and leaves zero open seats', () => {
    const placements = Array.from({ length: 18 }, (_, i) => p(`x${i}`, 'CONFIRMED'));
    const m = buildSeatModel(6, placements);
    expect(m.filled).toBe(18);
    expect(m.remaining).toBe(0);
    expect(m.overfilledBy).toBe(12);
    expect(m.seats.filter((s) => s.kind === 'filled')).toHaveLength(6);
    expect(m.seats.filter((s) => s.kind === 'over_capacity')).toHaveLength(12);
    expect(m.seats.filter((s) => s.kind === 'open')).toHaveLength(0);
    // Every placement is still visible.
    expect(m.seats.length + m.notHoldingSeat.length).toBe(18);
  });

  it('seat order is by placement time (earliest holds seat 1)', () => {
    const early = p('early', 'CONFIRMED');
    const late = p('late', 'CONFIRMED');
    const m = buildSeatModel(2, [late, early]);
    const first = m.seats[0];
    expect(first?.kind === 'filled' && first.placement.personId).toBe('early');
  });

  it('flags a confirmed or started seat without a start date as start pending (Gate B #9)', () => {
    const m = buildSeatModel(3, [
      p('a', 'CONFIRMED', { startDate: null }),
      p('b', 'STARTED', { startDate: null }),
      p('c', 'COMPLETED', { startDate: null }),
    ]);
    const pending = m.seats.map((s) => (s.kind === 'open' ? null : s.startPending));
    expect(pending).toEqual([true, true, false]);
  });

  it('zero or negative positions never produce open rows', () => {
    expect(buildSeatModel(0, []).seats).toEqual([]);
    expect(buildSeatModel(-2, []).required).toBe(0);
  });
});

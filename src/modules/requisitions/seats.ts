/**
 * R2 — seat view for a job requirement, DERIVED from placements.
 *
 * Nothing here is stored: a "seat" is a presentation of R0's capacity
 * rule (placements/service.ts countSeatsFilled):
 *   - a placement holds a seat while CONFIRMED, STARTED or COMPLETED,
 *   - archived placements never count,
 *   - capacity is counted per DISTINCT person.
 * Open positions are the arithmetic remainder (required − filled) and are
 * labelled as derived. Historical overfill (more seat-holders than
 * positions, e.g. data from before the R0 guards) is shown in full as
 * "over capacity" rows — never truncated, never presented as available.
 */

export const SEAT_HOLDING_STATUSES = ['CONFIRMED', 'STARTED', 'COMPLETED'] as const;

export type SeatPlacementInput = {
  id: string;
  personId: string;
  personName: string;
  status: 'PROPOSED' | 'CONFIRMED' | 'STARTED' | 'COMPLETED' | 'TERMINATED_EARLY';
  startDate: string | null;
  createdAt: Date;
  archivedAt?: Date | null;
};

export type SeatRow<P extends SeatPlacementInput = SeatPlacementInput> =
  | { kind: 'filled'; seatNumber: number; placement: P; startPending: boolean }
  | { kind: 'over_capacity'; placement: P; startPending: boolean }
  | { kind: 'open'; seatNumber: number };

export type NonSeatRow<P extends SeatPlacementInput = SeatPlacementInput> = {
  placement: P;
  reason: 'proposed' | 'ended_early' | 'duplicate_person';
};

export type SeatModel<P extends SeatPlacementInput = SeatPlacementInput> = {
  required: number;
  filled: number;
  remaining: number;
  overfilledBy: number;
  seats: SeatRow<P>[];
  notHoldingSeat: NonSeatRow<P>[];
};

function holdsSeat(status: SeatPlacementInput['status']): boolean {
  return (SEAT_HOLDING_STATUSES as readonly string[]).includes(status);
}

export function buildSeatModel<P extends SeatPlacementInput>(
  positionsRequired: number,
  placements: P[],
): SeatModel<P> {
  const live = placements
    .filter((p) => !p.archivedAt)
    .slice()
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const seatHolders: P[] = [];
  const notHoldingSeat: NonSeatRow<P>[] = [];
  const seenPeople = new Set<string>();
  for (const p of live) {
    if (!holdsSeat(p.status)) {
      notHoldingSeat.push({
        placement: p,
        reason: p.status === 'TERMINATED_EARLY' ? 'ended_early' : 'proposed',
      });
      continue;
    }
    if (seenPeople.has(p.personId)) {
      notHoldingSeat.push({ placement: p, reason: 'duplicate_person' });
      continue;
    }
    seenPeople.add(p.personId);
    seatHolders.push(p);
  }

  const required = Math.max(0, positionsRequired);
  const filled = seatHolders.length;
  const seats: SeatRow<P>[] = [];
  seatHolders.forEach((p, i) => {
    const startPending = !p.startDate && (p.status === 'CONFIRMED' || p.status === 'STARTED');
    if (i < required) seats.push({ kind: 'filled', seatNumber: i + 1, placement: p, startPending });
    else seats.push({ kind: 'over_capacity', placement: p, startPending });
  });
  for (let n = filled + 1; n <= required; n++) seats.push({ kind: 'open', seatNumber: n });

  return {
    required,
    filled,
    remaining: Math.max(0, required - filled),
    overfilledBy: Math.max(0, filled - required),
    seats,
    notHoldingSeat,
  };
}

/** Human labels for the stored requisition statuses (Gate B #1: enums
 *  unchanged, display mapped). */
export const REQUISITION_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft',
  OPEN: 'Open',
  IN_PROGRESS: 'In progress',
  PARTIALLY_FILLED: 'Partially filled',
  FILLED: 'Filled',
  CLOSED: 'Closed',
  CANCELLED: 'Cancelled',
};

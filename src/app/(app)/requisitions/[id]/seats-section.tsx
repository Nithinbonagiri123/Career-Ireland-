import { AlertTriangle, Armchair, ArrowRight, FileText, History } from 'lucide-react';
import Link from 'next/link';
import { initialsOf } from '@/components/ds/entity-card';
import { DsEnumPill, DsStatusPill } from '@/components/ds/status-pill';
import { DS_SOFT } from '@/components/ds/tones';
import { SectionCard } from '@/components/ds/workspace';
import { Timestamp } from '@/components/timestamp';
import { cn } from '@/lib/utils';
import type { PlacementListRow } from '@/modules/placements/service';
import type { NonSeatRow, SeatModel, SeatRow } from '@/modules/requisitions/seats';

/**
 * R2 — Seats & placements. Every row is derived from placements by the
 * R0 capacity rule (see modules/requisitions/seats.ts): filled seats,
 * historical over-capacity placements (shown in full, never hidden), and
 * open positions — which are arithmetic, not stored records, and are
 * labelled as such. Fees reuse the existing per-placement invoice link /
 * guarded "Raise fee" flow on the employer workspace.
 *
 * Stage 6G — section cards, pastel pills, initials avatars.
 */
export function SeatsSection({ model }: { model: SeatModel<PlacementListRow> }) {
  return (
    <div className="space-y-5">
      {model.overfilledBy > 0 && (
        <div
          className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100"
          role="status"
          data-testid="seats-overfilled"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
          <span>
            {model.filled} people hold seats against {model.required} position
            {model.required === 1 ? '' : 's'} — over capacity by {model.overfilledBy}. These
            placements predate the seat guards and are shown as recorded; no further placements can
            be made until positions are increased or a placement ends.
          </span>
        </div>
      )}

      <SectionCard
        icon={Armchair}
        title="Seats"
        description="A seat is held by a confirmed, started or completed placement. Open positions are the remaining capacity — they are calculated, not separate records."
        action={
          <DsStatusPill tone={model.overfilledBy > 0 ? 'amber' : 'blue'}>
            {model.filled} of {model.required} filled
          </DsStatusPill>
        }
      >
        {model.seats.length === 0 ? (
          <p className="text-sm text-muted-foreground">This job has no positions set.</p>
        ) : (
          <ul
            className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60"
            data-testid="seat-rows"
          >
            {model.seats.map((row) => (
              <SeatListItem key={seatKey(row)} row={row} />
            ))}
          </ul>
        )}
      </SectionCard>

      {model.notHoldingSeat.length > 0 && (
        <SectionCard
          icon={History}
          title="Placements not holding a seat"
          count={model.notHoldingSeat.length}
          description="Proposed placements, placements that ended early, and repeat placements of someone who already holds a seat on this job."
        >
          <ul
            className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60"
            data-testid="non-seat-rows"
          >
            {model.notHoldingSeat.map((row) => (
              <NonSeatListItem key={row.placement.id} row={row} />
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}

function seatKey(row: SeatRow<PlacementListRow>): string {
  return row.kind === 'open' ? `open-${row.seatNumber}` : row.placement.id;
}

const ROW = 'flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-3 sm:px-4';
const LEAD = 'w-[6.5rem] shrink-0';

function SeatListItem({ row }: { row: SeatRow<PlacementListRow> }) {
  if (row.kind === 'open') {
    return (
      <li className={cn(ROW, 'text-sm text-muted-foreground')} data-seat-kind="open">
        <span className={LEAD}>
          <DsStatusPill tone="slate" className="bg-transparent">
            Seat {row.seatNumber}
          </DsStatusPill>
        </span>
        <span className="flex-1">Open position (calculated)</span>
      </li>
    );
  }
  const p = row.placement;
  return (
    <li
      className={cn(ROW, row.kind === 'over_capacity' && 'bg-amber-50/50 dark:bg-amber-950/20')}
      data-seat-kind={row.kind}
    >
      <span className={LEAD}>
        {row.kind === 'filled' ? (
          <DsStatusPill tone="green">Seat {row.seatNumber}</DsStatusPill>
        ) : (
          <DsStatusPill tone="amber">Over capacity</DsStatusPill>
        )}
      </span>
      <PlacementSummary p={p} startPending={row.startPending} />
      <FeeCell p={p} />
    </li>
  );
}

function NonSeatListItem({ row }: { row: NonSeatRow<PlacementListRow> }) {
  const label =
    row.reason === 'proposed'
      ? 'Proposed'
      : row.reason === 'ended_early'
        ? 'Ended early'
        : 'Repeat placement';
  return (
    <li className={ROW} data-non-seat={row.reason}>
      <span className={LEAD}>
        <DsStatusPill tone="slate">{label}</DsStatusPill>
      </span>
      <PlacementSummary p={row.placement} startPending={false} />
      <FeeCell p={row.placement} />
    </li>
  );
}

function PlacementSummary({ p, startPending }: { p: PlacementListRow; startPending: boolean }) {
  return (
    <div className="flex min-w-0 flex-1 basis-56 items-center gap-3">
      <span
        aria-hidden
        className={cn(
          'grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold',
          DS_SOFT.blue,
        )}
      >
        {initialsOf(p.personName)}
      </span>
      <div className="min-w-0">
        <Link
          href={`/clients/${p.personId}`}
          className="block truncate text-sm font-semibold text-foreground hover:underline"
        >
          {p.personName}
        </Link>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <DsEnumPill status={p.status} />
          {p.startDate ? (
            <span>Starts {p.startDate}</span>
          ) : startPending ? (
            <span data-testid="start-pending">
              <DsStatusPill tone="amber" className="normal-case tracking-normal">
                Start date pending
              </DsStatusPill>
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1">
            Placed <Timestamp date={p.createdAt} absoluteOnly />
          </span>
        </p>
      </div>
    </div>
  );
}

function FeeCell({ p }: { p: PlacementListRow }) {
  const inv = p.latestInvoice;
  if (inv) {
    return (
      <Link
        href={`/employers/${p.employerId}/invoices/${inv.number}`}
        className="ml-auto flex shrink-0 flex-col items-end gap-1 rounded-lg px-2 py-1 text-right transition-colors hover:bg-muted"
      >
        <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <FileText className="size-3.5 text-sky-600" aria-hidden />
          <span className="font-mono">{inv.number}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <DsEnumPill status={inv.status} />
          <span className="tabular-nums text-xs text-muted-foreground">
            {inv.totalAmount} {inv.currencyCode}
          </span>
        </span>
      </Link>
    );
  }
  if (p.status === 'PROPOSED' || p.status === 'TERMINATED_EARLY') return null;
  return (
    <Link
      href={`/employers/${p.employerId}?raisePlacement=${p.id}&raiseRequisition=${p.jobRequisitionId}`}
      className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border/70 bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
    >
      Raise fee <ArrowRight className="size-3.5" aria-hidden />
    </Link>
  );
}

import { AlertTriangle, Armchair, ArrowRight, FileText, User } from 'lucide-react';
import Link from 'next/link';
import { Timestamp } from '@/components/timestamp';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { statusTone } from '@/lib/ui/status-tone';
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
 */
export function SeatsSection({ model }: { model: SeatModel<PlacementListRow> }) {
  return (
    <div className="space-y-6">
      {model.overfilledBy > 0 && (
        <div
          className="flex items-start gap-2 rounded-lg border border-status-warning/40 bg-status-warning/10 px-4 py-3 text-sm text-status-warning"
          role="status"
          data-testid="seats-overfilled"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {model.filled} people hold seats against {model.required} position
            {model.required === 1 ? '' : 's'} — over capacity by {model.overfilledBy}. These
            placements predate the seat guards and are shown as recorded; no further placements can
            be made until positions are increased or a placement ends.
          </span>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Armchair className="size-4 text-muted-foreground" aria-hidden />
            Seats
            <Badge variant="secondary" className="ml-1 rounded-full text-[10px] tabular-nums">
              {model.filled} of {model.required} filled
            </Badge>
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            A seat is held by a confirmed, started or completed placement. Open positions are the
            remaining capacity — they are calculated, not separate records.
          </p>
        </CardHeader>
        <CardContent>
          {model.seats.length === 0 ? (
            <p className="text-sm text-muted-foreground">This job has no positions set.</p>
          ) : (
            <ul className="divide-y rounded-md border" data-testid="seat-rows">
              {model.seats.map((row) => (
                <SeatListItem key={seatKey(row)} row={row} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {model.notHoldingSeat.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Placements not holding a seat</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Proposed placements, placements that ended early, and repeat placements of someone who
              already holds a seat on this job.
            </p>
          </CardHeader>
          <CardContent>
            <ul className="divide-y rounded-md border" data-testid="non-seat-rows">
              {model.notHoldingSeat.map((row) => (
                <NonSeatListItem key={row.placement.id} row={row} />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function seatKey(row: SeatRow<PlacementListRow>): string {
  return row.kind === 'open' ? `open-${row.seatNumber}` : row.placement.id;
}

function SeatListItem({ row }: { row: SeatRow<PlacementListRow> }) {
  if (row.kind === 'open') {
    return (
      <li
        className="flex items-center gap-3 px-3 py-2.5 text-sm text-muted-foreground"
        data-seat-kind="open"
      >
        <SeatBadge label={`Seat ${row.seatNumber}`} />
        <span className="flex-1 italic">Open position (calculated)</span>
      </li>
    );
  }
  const p = row.placement;
  return (
    <li
      className={cn(
        'flex flex-wrap items-center gap-3 px-3 py-2.5',
        row.kind === 'over_capacity' && 'bg-status-warning/5',
      )}
      data-seat-kind={row.kind}
    >
      {row.kind === 'filled' ? (
        <SeatBadge label={`Seat ${row.seatNumber}`} filled />
      ) : (
        <span className="inline-flex shrink-0 items-center rounded-full border border-status-warning/40 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-status-warning">
          Over capacity
        </span>
      )}
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
    <li className="flex flex-wrap items-center gap-3 px-3 py-2.5" data-non-seat={row.reason}>
      <span className="inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <PlacementSummary p={row.placement} startPending={false} />
      <FeeCell p={row.placement} />
    </li>
  );
}

function SeatBadge({ label, filled }: { label: string; filled?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex w-16 shrink-0 items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        filled
          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
          : 'border border-dashed',
      )}
    >
      {label}
    </span>
  );
}

function PlacementSummary({ p, startPending }: { p: PlacementListRow; startPending: boolean }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted">
        <User className="size-4 text-muted-foreground" aria-hidden />
      </span>
      <div className="min-w-0">
        <Link
          href={`/clients/${p.personId}`}
          className="block truncate text-sm font-medium text-foreground hover:underline"
        >
          {p.personName}
        </Link>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
          <Badge variant={statusTone(p.status)} className="rounded-full text-[10px]">
            {p.status.replace(/_/g, ' ')}
          </Badge>
          {p.startDate ? (
            <span>Starts {p.startDate}</span>
          ) : startPending ? (
            <span
              className="rounded-full border border-status-warning/40 px-1.5 text-status-warning"
              data-testid="start-pending"
            >
              Start date pending
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
        className="flex shrink-0 flex-col items-end text-right transition-colors hover:text-foreground"
      >
        <span className="flex items-center gap-1.5">
          <FileText className="size-3 text-muted-foreground" aria-hidden />
          <span className="font-mono text-xs">{inv.number}</span>
        </span>
        <span className="mt-0.5 flex items-center gap-1.5">
          <Badge variant={statusTone(inv.status)} className="rounded-full text-[9px]">
            {inv.status.replace(/_/g, ' ')}
          </Badge>
          <span className="tabular-nums text-[10px] text-muted-foreground">
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
      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-status-warning/40 bg-background px-2 py-1 text-[11px] font-medium text-status-warning transition-colors hover:bg-status-warning/10"
    >
      Raise fee <ArrowRight className="size-3" aria-hidden />
    </Link>
  );
}

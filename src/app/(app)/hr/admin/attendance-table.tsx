'use client';

import { CalendarClock, Pencil } from 'lucide-react';
import { useState } from 'react';
import {
  AttendanceStatePill,
  attendanceStates,
  DateTime,
  DS_STICKY_END,
  Duration,
  formatDuration,
  RunningDuration,
  TimesheetTable,
} from '@/components/ds/attendance';
import { DsCardItem, DsTd, DsTh, DsTr } from '@/components/ds/data-table';
import { FOCUS_RING } from '@/components/ds/segmented';
import { useNow } from '@/components/ds/use-now';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AttendanceRow } from '@/modules/hr/service';
import { CorrectionDialog } from './correction-dialog';

/**
 * HR Board timesheet. Rows arrive sorted by clock-in (newest first). From
 * `md` up it is a scrolling table whose actions column stays pinned on the
 * right, so "Correct" is always reachable; phones get one card per
 * session. Calculations are unchanged: net = (clock-out − clock-in) −
 * closed breaks; an open session shows its start and elapsed time.
 */
export function AttendanceTable({ rows }: { rows: AttendanceRow[] }) {
  const [target, setTarget] = useState<AttendanceRow['session'] | null>(null);
  const now = useNow(
    30_000,
    rows.some((r) => !r.session.clockOutAt),
  );

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card shadow-sm">
        <EmptyState
          icon={CalendarClock}
          title="No attendance in this period"
          description="Pick a wider date range above to see earlier sessions."
        />
      </div>
    );
  }

  const view = rows.map((r) => {
    const active = !r.session.clockOutAt;
    const grossMs = r.session.clockOutAt
      ? r.session.clockOutAt.getTime() - r.session.clockInAt.getTime()
      : 0;
    const breakMs = r.breaks.reduce((acc, b) => {
      if (!b.breakEndedAt) return acc;
      return acc + Math.max(0, b.breakEndedAt.getTime() - b.breakStartedAt.getTime());
    }, 0);
    const openBreak = r.breaks.find((b) => !b.breakEndedAt) ?? null;
    const states = attendanceStates({
      clockInAt: r.session.clockInAt,
      clockOutAt: r.session.clockOutAt,
      autoClosed: r.session.autoClosed,
      correctionReason: r.session.correctionReason,
      onBreak: openBreak !== null,
      now,
    });
    return { r, active, breakMs, netMs: Math.max(0, grossMs - breakMs), states };
  });

  const correctButton = (r: AttendanceRow, wide = false) => (
    <Button
      variant={wide ? 'outline' : 'ghost'}
      size={wide ? 'sm' : 'icon-sm'}
      aria-label={`Correct ${r.userName}'s attendance`}
      onClick={() => setTarget(r.session)}
      className={FOCUS_RING}
    >
      <Pencil className="size-3.5" aria-hidden />
      {wide && <span className="ml-1.5">Correct</span>}
    </Button>
  );

  const correctionNote = (r: AttendanceRow) =>
    r.session.correctionReason ? (
      <p className="mt-1 text-[11px] text-muted-foreground [overflow-wrap:anywhere]">
        Corrected
        {r.session.correctedAt && (
          <>
            {' '}
            <DateTime value={r.session.correctedAt} />
          </>
        )}
        : “{r.session.correctionReason}”
      </p>
    ) : null;

  return (
    <>
      <TimesheetTable
        label="Attendance sessions"
        caption="Attendance sessions, newest clock-in first"
        testId="hr-attendance-table"
        head={
          <tr>
            <DsTh>Staff</DsTh>
            <DsTh>Status</DsTh>
            <DsTh>Clock-in</DsTh>
            <DsTh>Clock-out</DsTh>
            <DsTh numeric>Break</DsTh>
            <DsTh numeric>Net worked</DsTh>
            <th scope="col" className={cn('w-px px-4 py-2.5', DS_STICKY_END)}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        }
        body={view.map(({ r, active, breakMs, netMs, states }) => (
          <DsTr key={r.session.id}>
            <DsTd className="min-w-[13rem]">
              <p className="text-sm font-medium text-foreground">{r.userName}</p>
              <p className="text-[11px] text-muted-foreground">{r.userEmail}</p>
              {correctionNote(r)}
            </DsTd>
            <DsTd>
              <div className="flex flex-wrap gap-1">
                {states.map((s) => (
                  <AttendanceStatePill key={s} state={s} />
                ))}
              </div>
            </DsTd>
            <DsTd className="whitespace-nowrap text-xs">
              <DateTime value={r.session.clockInAt} />
            </DsTd>
            <DsTd className="whitespace-nowrap text-xs">
              {r.session.clockOutAt ? (
                <DateTime value={r.session.clockOutAt} />
              ) : (
                <span className="text-muted-foreground">Open</span>
              )}
            </DsTd>
            <DsTd numeric className="text-xs text-muted-foreground">
              {r.breaks.length === 0 ? (
                '—'
              ) : (
                <>
                  <Duration ms={breakMs} />
                  <span className="ml-1 text-[10px]">×{r.breaks.length}</span>
                </>
              )}
            </DsTd>
            <DsTd numeric className="text-xs">
              {active ? (
                <span className="text-muted-foreground">
                  {formatDuration(now.getTime() - r.session.clockInAt.getTime())} so far
                </span>
              ) : (
                <Duration ms={netMs} className="font-medium text-foreground" />
              )}
            </DsTd>
            <td className={cn('px-4 py-3 text-right', DS_STICKY_END)}>{correctButton(r)}</td>
          </DsTr>
        ))}
        cards={view.map(({ r, active, breakMs, netMs, states }) => (
          <DsCardItem key={r.session.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{r.userName}</p>
                <p className="truncate text-[11px] text-muted-foreground">{r.userEmail}</p>
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-1">
                {states.map((s) => (
                  <AttendanceStatePill key={s} state={s} />
                ))}
              </div>
            </div>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-muted-foreground">Clock-in</dt>
              <dd>
                <DateTime value={r.session.clockInAt} />
              </dd>
              <dt className="text-muted-foreground">Clock-out</dt>
              <dd>{r.session.clockOutAt ? <DateTime value={r.session.clockOutAt} /> : 'Open'}</dd>
              <dt className="text-muted-foreground">Break</dt>
              <dd className="tabular-nums">
                {r.breaks.length === 0 ? '—' : `${formatDuration(breakMs)} ×${r.breaks.length}`}
              </dd>
              <dt className="text-muted-foreground">Net worked</dt>
              <dd className="font-medium">
                {active ? (
                  <RunningDuration since={r.session.clockInAt} now={now} />
                ) : (
                  formatDuration(netMs)
                )}
              </dd>
            </dl>
            {correctionNote(r)}
            <div className="mt-3 flex justify-end">{correctButton(r, true)}</div>
          </DsCardItem>
        ))}
      />
      <CorrectionDialog
        target={target}
        onOpenChange={(next) => {
          if (!next) setTarget(null);
        }}
      />
    </>
  );
}

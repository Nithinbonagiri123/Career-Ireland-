'use client';

import { format, formatDistanceToNowStrict } from 'date-fns';
import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatusDot } from '@/components/ui/status-dot';
import type { AttendanceRow } from '@/modules/hr/service';
import { CorrectionDialog } from './correction-dialog';

/**
 * Recent attendance list for admins. Rows are already sorted server-
 * side by clock-in DESC; the client just handles the "correct" flow.
 */
export function AttendanceTable({ rows }: { rows: AttendanceRow[] }) {
  const [target, setTarget] = useState<AttendanceRow['session'] | null>(null);

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border bg-card px-4 py-8 text-center text-xs text-muted-foreground">
        No attendance in the recent window.
      </div>
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/20 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Staff</th>
              <th className="px-4 py-2 font-medium">Date</th>
              <th className="px-4 py-2 font-medium">Clock-in</th>
              <th className="px-4 py-2 font-medium">Clock-out</th>
              <th className="px-4 py-2 font-medium">Break</th>
              <th className="px-4 py-2 font-medium">Net worked</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const active = !r.session.clockOutAt;
              const grossMs = r.session.clockOutAt
                ? r.session.clockOutAt.getTime() - r.session.clockInAt.getTime()
                : 0;
              const breakMs = r.breaks.reduce((acc, b) => {
                if (!b.breakEndedAt) return acc;
                return acc + Math.max(0, b.breakEndedAt.getTime() - b.breakStartedAt.getTime());
              }, 0);
              const netMs = Math.max(0, grossMs - breakMs);
              const openBreak = r.breaks.find((b) => !b.breakEndedAt) ?? null;
              return (
                <tr key={r.session.id} className="border-b last:border-b-0 hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <StatusDot tone={openBreak ? 'warning' : active ? 'success' : 'neutral'} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{r.userName}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{r.userEmail}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {format(r.session.clockInAt, 'EEE d MMM')}
                  </td>
                  <td className="px-4 py-3 text-xs tabular-nums">
                    {format(r.session.clockInAt, 'HH:mm')}
                  </td>
                  <td className="px-4 py-3 text-xs tabular-nums">
                    {r.session.clockOutAt ? (
                      format(r.session.clockOutAt, 'HH:mm')
                    ) : openBreak ? (
                      <Badge variant="warning" className="rounded-full text-[10px]">
                        On break
                      </Badge>
                    ) : (
                      <Badge variant="info" className="rounded-full text-[10px]">
                        Active
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs tabular-nums text-muted-foreground">
                    {r.breaks.length === 0 ? (
                      <span className="text-muted-foreground/60">—</span>
                    ) : (
                      <>
                        {formatDuration(breakMs)}
                        <span className="ml-1 text-[10px] text-muted-foreground/70">
                          ×{r.breaks.length}
                        </span>
                      </>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs tabular-nums">
                    {active
                      ? formatDistanceToNowStrict(r.session.clockInAt)
                      : formatDuration(netMs)}
                    {r.session.autoClosed && (
                      <Badge variant="warning" className="ml-1.5 rounded-full text-[9px]">
                        auto
                      </Badge>
                    )}
                    {r.session.correctionReason && (
                      <Badge variant="info" className="ml-1.5 rounded-full text-[9px]">
                        edit
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Correct ${r.userName}'s attendance`}
                      onClick={() => setTarget(r.session)}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <CorrectionDialog
        target={target}
        onOpenChange={(next) => {
          if (!next) setTarget(null);
        }}
      />
    </>
  );
}

function formatDuration(ms: number): string {
  const total = Math.floor(ms / 60_000);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

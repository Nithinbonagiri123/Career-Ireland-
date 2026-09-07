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
              <th className="px-4 py-2 font-medium">Duration</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const active = !r.session.clockOutAt;
              const durationMs = r.session.clockOutAt
                ? r.session.clockOutAt.getTime() - r.session.clockInAt.getTime()
                : 0;
              const hours = Math.floor(durationMs / 3_600_000);
              const minutes = Math.floor((durationMs % 3_600_000) / 60_000);
              return (
                <tr key={r.session.id} className="border-b last:border-b-0 hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <StatusDot tone={active ? 'success' : 'neutral'} />
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
                    ) : (
                      <Badge variant="info" className="rounded-full text-[10px]">
                        Active
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs tabular-nums">
                    {active
                      ? formatDistanceToNowStrict(r.session.clockInAt)
                      : `${hours}h ${minutes}m`}
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

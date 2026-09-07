'use client';

import { formatDistanceToNowStrict } from 'date-fns';
import { Clock, LogIn, LogOut } from 'lucide-react';
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { AttendanceSession } from '@/lib/db/schema/hr';
import { clockInAction, clockOutAction } from '@/modules/hr/actions';

/**
 * Clock in / clock out control for the current user.
 *
 * The server owns all timestamps — the client only pings actions and
 * displays what comes back. A tiny local `now` ticker keeps the
 * "clocked in for N minutes" copy live without any client-side clock
 * tampering affecting the DB.
 */
export function ClockPanel({ initialOpen }: { initialOpen: AttendanceSession | null }) {
  const [openSession, setOpenSession] = useState<AttendanceSession | null>(initialOpen);
  const [pending, startTransition] = useTransition();
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    if (!openSession) return;
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, [openSession]);

  const onClockIn = () => {
    startTransition(async () => {
      const r = await clockInAction();
      if (r.ok) {
        setOpenSession(r.data);
        toast.success('Clocked in');
      } else {
        toast.error(r.error.message);
      }
    });
  };

  const onClockOut = () => {
    startTransition(async () => {
      const r = await clockOutAction();
      if (r.ok) {
        setOpenSession(null);
        toast.success('Clocked out');
      } else {
        toast.error(r.error.message);
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Attendance</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {openSession ? (
          <>
            <div className="flex items-center gap-3 rounded-md border border-status-success/30 bg-status-success-soft px-4 py-3">
              <div className="flex size-8 items-center justify-center rounded-md bg-status-success/20 text-status-success">
                <Clock className="size-4" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">You're clocked in</p>
                <p className="text-xs text-muted-foreground">
                  Started {formatDistanceToNowStrict(openSession.clockInAt, { addSuffix: true })} ·{' '}
                  {formatElapsed(openSession.clockInAt, now)} elapsed
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={onClockOut}
              className="w-full"
            >
              <LogOut className="mr-1.5 size-4" />
              Clock out
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              You are not currently clocked in. All timestamps are server-side.
            </p>
            <Button type="button" disabled={pending} onClick={onClockIn} className="w-full">
              <LogIn className="mr-1.5 size-4" />
              Clock in
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function formatElapsed(from: Date, now: Date): string {
  const ms = Math.max(0, now.getTime() - from.getTime());
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

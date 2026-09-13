'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Coffee, LogIn, LogOut, Pause, Play } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusDot } from '@/components/ui/status-dot';
import type { AttendanceBreakSession, AttendanceSession } from '@/lib/db/schema/hr';
import {
  clockInAction,
  clockOutAction,
  endBreakAction,
  startBreakAction,
} from '@/modules/hr/actions';
import type { MyTodayStatus } from '@/modules/hr/service';

/**
 * Today card — the caller sees their current attendance state
 * (Working / On break / Off), a live-ticking elapsed timer, and the
 * day's net worked/break time.
 *
 * All timestamps come from the server (`NOW()` inside the transaction).
 * The client only ticks a local `now` to keep the timer copy fresh.
 * Actions round-trip through server actions and mutate local state
 * with the row the server returned; no optimistic writes.
 */
type Status = 'off' | 'working' | 'on_break';

export function ClockPanel({ initial }: { initial: MyTodayStatus }) {
  const router = useRouter();
  const [openSession, setOpenSession] = useState<AttendanceSession | null>(initial.openSession);
  const [openBreak, setOpenBreak] = useState<AttendanceBreakSession | null>(initial.openBreak);
  const [todaySessions, setTodaySessions] = useState<AttendanceSession[]>(initial.todaySessions);
  const [todayBreaks, setTodayBreaks] = useState<AttendanceBreakSession[]>(initial.todayBreaks);
  const [pending, startTransition] = useTransition();
  const [now, setNow] = useState<Date>(() => new Date());

  const status: Status = openBreak ? 'on_break' : openSession ? 'working' : 'off';

  useEffect(() => {
    // Tick only when the card has a live timer to render.
    if (status === 'off') return;
    const t = setInterval(() => setNow(new Date()), 1_000);
    return () => clearInterval(t);
  }, [status]);

  const todayTotals = useMemo(
    () => computeTodayTotals(todaySessions, todayBreaks, openSession, openBreak, now),
    [todaySessions, todayBreaks, openSession, openBreak, now],
  );

  const primaryTimerMs = useMemo(() => {
    if (openBreak) return Math.max(0, now.getTime() - openBreak.breakStartedAt.getTime());
    if (openSession) return Math.max(0, now.getTime() - openSession.clockInAt.getTime());
    return 0;
  }, [openSession, openBreak, now]);

  // Refresh sibling server components (like "My recent sessions" on the
  // same page) after every action. `revalidatePath('/hr')` in the action
  // marks the cache stale but the client keeps the pre-action RSC tree
  // until we ask for a re-render — so we do that here.
  const refreshSiblings = () => router.refresh();

  const onClockIn = () => {
    startTransition(async () => {
      const r = await clockInAction();
      if (r.ok) {
        setOpenSession(r.data);
        setTodaySessions((prev) => [r.data, ...prev]);
        refreshSiblings();
        toast.success('Clocked in');
      } else toast.error(r.error.message);
    });
  };

  const onClockOut = () => {
    startTransition(async () => {
      const r = await clockOutAction();
      if (r.ok) {
        setOpenSession(null);
        setOpenBreak(null);
        setTodaySessions((prev) => prev.map((s) => (s.id === r.data.id ? r.data : s)));
        refreshSiblings();
        toast.success('Clocked out');
      } else toast.error(r.error.message);
    });
  };

  const onStartBreak = () => {
    startTransition(async () => {
      const r = await startBreakAction();
      if (r.ok) {
        setOpenBreak(r.data);
        setTodayBreaks((prev) => [r.data, ...prev]);
        refreshSiblings();
        toast.success('Break started');
      } else toast.error(r.error.message);
    });
  };

  const onEndBreak = () => {
    startTransition(async () => {
      const r = await endBreakAction();
      if (r.ok) {
        setOpenBreak(null);
        setTodayBreaks((prev) => prev.map((b) => (b.id === r.data.id ? r.data : b)));
        refreshSiblings();
        toast.success('Break ended');
      } else toast.error(r.error.message);
    });
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Today</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <StatusPanel status={status} elapsedMs={primaryTimerMs} />

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={status}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
            className="flex flex-col gap-2"
          >
            {status === 'off' && (
              <Button disabled={pending} onClick={onClockIn} className="w-full">
                <LogIn className="mr-1.5 size-4" />
                Clock in
              </Button>
            )}
            {status === 'working' && (
              <>
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={onStartBreak}
                  className="w-full"
                >
                  <Coffee className="mr-1.5 size-4" />
                  Start break
                </Button>
                <Button
                  variant="destructive"
                  disabled={pending}
                  onClick={onClockOut}
                  className="w-full"
                >
                  <LogOut className="mr-1.5 size-4" />
                  Clock out
                </Button>
              </>
            )}
            {status === 'on_break' && (
              <>
                <Button disabled={pending} onClick={onEndBreak} className="w-full">
                  <Play className="mr-1.5 size-4" />
                  End break
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={onClockOut}
                  className="w-full text-muted-foreground"
                >
                  <LogOut className="mr-1.5 size-4" />
                  Clock out (auto-ends break)
                </Button>
              </>
            )}
          </motion.div>
        </AnimatePresence>

        <div className="grid grid-cols-2 gap-2 rounded-md border bg-muted/30 p-3 text-center">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Worked today
            </div>
            <div className="mt-0.5 text-sm font-medium tabular-nums">
              {formatDuration(todayTotals.workedMs)}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Break today
            </div>
            <div className="mt-0.5 text-sm font-medium tabular-nums">
              {formatDuration(todayTotals.breakMs)}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusPanel({ status, elapsedMs }: { status: Status; elapsedMs: number }) {
  const cfg =
    status === 'working'
      ? {
          tone: 'success' as const,
          label: 'Working',
          border: 'border-status-success/30 bg-status-success-soft',
          Icon: Play,
        }
      : status === 'on_break'
        ? {
            tone: 'warning' as const,
            label: 'On break',
            border: 'border-status-warning/30 bg-status-warning-soft',
            Icon: Pause,
          }
        : {
            tone: 'neutral' as const,
            label: 'Off the clock',
            border: 'border-border bg-muted/30',
            Icon: LogIn,
          };
  return (
    <motion.div
      layout
      className={`flex items-center gap-3 rounded-md border px-4 py-3 ${cfg.border}`}
    >
      <StatusDot tone={cfg.tone} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-tight">{cfg.label}</p>
        {status !== 'off' && (
          <p className="text-xs text-muted-foreground tabular-nums">
            {formatElapsed(elapsedMs)} elapsed
          </p>
        )}
        {status === 'off' && (
          <p className="text-xs text-muted-foreground">Clock in to start tracking</p>
        )}
      </div>
    </motion.div>
  );
}

function computeTodayTotals(
  sessions: AttendanceSession[],
  breaks: AttendanceBreakSession[],
  openSession: AttendanceSession | null,
  openBreak: AttendanceBreakSession | null,
  now: Date,
) {
  const nowMs = now.getTime();

  let grossMs = 0;
  for (const s of sessions) {
    const end = s.clockOutAt ? s.clockOutAt.getTime() : openSession?.id === s.id ? nowMs : null;
    if (end === null) continue;
    grossMs += Math.max(0, end - s.clockInAt.getTime());
  }

  let breakMs = 0;
  for (const b of breaks) {
    const end = b.breakEndedAt ? b.breakEndedAt.getTime() : openBreak?.id === b.id ? nowMs : null;
    if (end === null) continue;
    breakMs += Math.max(0, end - b.breakStartedAt.getTime());
  }

  return { workedMs: Math.max(0, grossMs - breakMs), breakMs };
}

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m ${s.toString().padStart(2, '0')}s`;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

function formatDuration(ms: number): string {
  const total = Math.floor(ms / 60_000);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

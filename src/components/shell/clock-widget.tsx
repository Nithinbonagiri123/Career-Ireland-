'use client';

import { Coffee, LogIn, LogOut, Play } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  clockInAction,
  clockOutAction,
  endBreakAction,
  startBreakAction,
} from '@/modules/hr/actions';

/**
 * Phase 1 blueprint §11.1 — Clock in/out moves from `/hr` to the
 * topbar as a live widget.
 *
 * Previously an operator had to navigate to `/hr`, click Clock In,
 * then come back to Dashboard — same thing at end of day. Easy to
 * forget. Now the widget is one click away from anywhere.
 *
 * The widget renders in three states:
 *   - Off the clock → `[● Clock in]` button
 *   - Working      → live timer + dropdown with Clock out / Start break
 *   - On break     → live break timer + dropdown with End break / Clock out
 *
 * The full /hr page remains the authoritative Attendance surface for
 * history + totals + corrections.
 */
export function ClockWidget({
  initialStatus,
  initialOpenSessionAt,
  initialOpenBreakAt,
}: {
  initialStatus: 'off' | 'working' | 'on_break';
  initialOpenSessionAt: Date | null;
  initialOpenBreakAt: Date | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [openSessionAt, setOpenSessionAt] = useState<Date | null>(initialOpenSessionAt);
  const [openBreakAt, setOpenBreakAt] = useState<Date | null>(initialOpenBreakAt);
  const [now, setNow] = useState<Date>(() => new Date());
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (status === 'off') return;
    const t = setInterval(() => setNow(new Date()), 1_000);
    return () => clearInterval(t);
  }, [status]);

  const refresh = () => router.refresh();

  const onClockIn = () => {
    startTransition(async () => {
      const r = await clockInAction();
      if (r.ok) {
        setStatus('working');
        setOpenSessionAt(r.data.clockInAt);
        setOpenBreakAt(null);
        refresh();
        toast.success('Clocked in');
      } else toast.error(r.error.message);
    });
  };

  const onClockOut = () => {
    startTransition(async () => {
      const r = await clockOutAction();
      if (r.ok) {
        setStatus('off');
        setOpenSessionAt(null);
        setOpenBreakAt(null);
        refresh();
        toast.success('Clocked out');
      } else toast.error(r.error.message);
    });
  };

  const onStartBreak = () => {
    startTransition(async () => {
      const r = await startBreakAction();
      if (r.ok) {
        setStatus('on_break');
        setOpenBreakAt(r.data.breakStartedAt);
        refresh();
        toast.success('Break started');
      } else toast.error(r.error.message);
    });
  };

  const onEndBreak = () => {
    startTransition(async () => {
      const r = await endBreakAction();
      if (r.ok) {
        setStatus('working');
        setOpenBreakAt(null);
        refresh();
        toast.success('Break ended');
      } else toast.error(r.error.message);
    });
  };

  if (status === 'off') {
    return (
      <button
        type="button"
        onClick={onClockIn}
        disabled={pending}
        aria-label="Clock in"
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border/60 bg-background px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:border-border hover:text-foreground disabled:opacity-50"
      >
        <LogIn className="size-3.5" />
        {/* Session 37 — the "Clock in" label fights for space in a
            crowded mobile top bar. Hide it under sm; the icon + aria
            label are enough on narrow viewports. */}
        <span className="hidden sm:inline">Clock in</span>
      </button>
    );
  }

  const timerMs =
    status === 'on_break'
      ? openBreakAt
        ? Math.max(0, now.getTime() - openBreakAt.getTime())
        : 0
      : openSessionAt
        ? Math.max(0, now.getTime() - openSessionAt.getTime())
        : 0;
  const label = formatTimerLabel(timerMs);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            disabled={pending}
            className={
              status === 'on_break'
                ? 'inline-flex h-9 items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2.5 text-xs font-medium text-amber-900 transition-colors hover:border-amber-400 disabled:opacity-50 dark:border-amber-800/60 dark:bg-amber-950/50 dark:text-amber-100'
                : 'inline-flex h-9 items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-2.5 text-xs font-medium text-emerald-900 transition-colors hover:border-emerald-400 disabled:opacity-50 dark:border-emerald-800/60 dark:bg-emerald-950/50 dark:text-emerald-100'
            }
          />
        }
      >
        <span className="relative flex size-2">
          <span
            className={
              status === 'on_break'
                ? 'absolute inset-0 animate-ping rounded-full bg-amber-500/60'
                : 'absolute inset-0 animate-ping rounded-full bg-emerald-500/60'
            }
          />
          <span
            className={
              status === 'on_break'
                ? 'relative size-2 rounded-full bg-amber-500'
                : 'relative size-2 rounded-full bg-emerald-500'
            }
          />
        </span>
        <span className="font-mono tabular-nums">{label}</span>
        <span className="hidden text-[10px] uppercase tracking-wide opacity-70 sm:inline">
          {status === 'on_break' ? 'break' : 'working'}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[180px]">
        {status === 'working' ? (
          <>
            <DropdownMenuItem onSelect={onStartBreak}>
              <Coffee className="mr-2 size-4" /> Start break
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onClockOut}>
              <LogOut className="mr-2 size-4" /> Clock out
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuItem onSelect={onEndBreak}>
              <Play className="mr-2 size-4" /> End break
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onClockOut}>
              <LogOut className="mr-2 size-4" /> Clock out
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function formatTimerLabel(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

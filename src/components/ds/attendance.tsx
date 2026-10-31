import { format } from 'date-fns';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { DsCardList, DsTable, DsTBody, DsTHead, ResponsiveTable } from './data-table';
import { DsStatusPill } from './status-pill';
import type { DsTone } from './tones';

/**
 * Stage 6G attendance primitives (HR). Display only — nothing here changes
 * how attendance is recorded or calculated.
 *
 * Time zone: these format with date-fns in whatever environment renders
 * them (server zone in server components, browser zone in client
 * components) — exactly as the HR screens did before. Moving HR to
 * Europe/Dublin is a separate, unapproved change (S-HR3).
 */

/** "0m", "45m", "3h 05m" — whole minutes, floored. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 60_000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}

/** Absolute date + time, always with the year (timestamp rule). */
export function formatDateTime(d: Date): string {
  return format(d, 'EEE d MMM yyyy · HH:mm');
}
export function formatDay(d: Date): string {
  return format(d, 'EEE d MMM yyyy');
}
export function formatClock(d: Date): string {
  return format(d, 'HH:mm');
}

export function DateTime({
  value,
  variant = 'datetime',
  className,
}: {
  value: Date;
  variant?: 'datetime' | 'date' | 'time';
  className?: string;
}) {
  const text =
    variant === 'date'
      ? formatDay(value)
      : variant === 'time'
        ? formatClock(value)
        : formatDateTime(value);
  return (
    <time
      dateTime={value.toISOString()}
      title={formatDateTime(value)}
      className={cn('tabular-nums', className)}
    >
      {text}
    </time>
  );
}

export function Duration({ ms, className }: { ms: number; className?: string }) {
  return <span className={cn('tabular-nums', className)}>{formatDuration(ms)}</span>;
}

/** Open session: absolute start plus elapsed ("since Thu 30 Oct 2026 · 09:12 · 2h 05m"). */
export function RunningDuration({
  since,
  now,
  className,
}: {
  since: Date;
  now: Date;
  className?: string;
}) {
  return (
    <span className={cn('tabular-nums', className)}>
      since <DateTime value={since} /> · {formatDuration(now.getTime() - since.getTime())}
    </span>
  );
}

export type AttendanceState =
  | 'working'
  | 'on_break'
  | 'off'
  | 'clocked_out'
  | 'auto_closed'
  | 'corrected'
  | 'missing_clock_out';

export const ATTENDANCE_STATE: Record<AttendanceState, { label: string; tone: DsTone }> = {
  working: { label: 'Working', tone: 'green' },
  on_break: { label: 'On break', tone: 'amber' },
  off: { label: 'Off', tone: 'slate' },
  clocked_out: { label: 'Clocked out', tone: 'slate' },
  auto_closed: { label: 'Auto-closed', tone: 'violet' },
  corrected: { label: 'Corrected', tone: 'blue' },
  missing_clock_out: { label: 'Missing clock-out', tone: 'rose' },
};

/**
 * Which pills a session shows. An open session is Working / On break, or
 * "Missing clock-out" once it has been open longer than the auto-close
 * window (14h — `ATTENDANCE_AUTO_CLOSE_HOURS` in the HR service). A closed
 * session is "Clocked out" unless it was auto-closed and/or corrected.
 */
export function attendanceStates(input: {
  clockInAt: Date;
  clockOutAt: Date | null;
  autoClosed?: boolean | null;
  correctionReason?: string | null;
  onBreak?: boolean;
  now: Date;
  staleAfterHours?: number;
}): AttendanceState[] {
  const stale = (input.staleAfterHours ?? 14) * 60 * 60 * 1000;
  if (!input.clockOutAt) {
    if (input.now.getTime() - input.clockInAt.getTime() > stale) return ['missing_clock_out'];
    return [input.onBreak ? 'on_break' : 'working'];
  }
  const states: AttendanceState[] = [];
  if (input.autoClosed) states.push('auto_closed');
  if (input.correctionReason) states.push('corrected');
  return states.length > 0 ? states : ['clocked_out'];
}

/** Text + tone, never colour alone. `label` overrides the default wording. */
export function AttendanceStatePill({
  state,
  label,
  className,
}: {
  state: AttendanceState;
  label?: string;
  className?: string;
}) {
  const def = ATTENDANCE_STATE[state];
  return (
    <DsStatusPill tone={def.tone} className={className}>
      {label ?? def.label}
    </DsStatusPill>
  );
}

/** Sticky last column so row actions stay on screen while a wide table scrolls. */
export const DS_STICKY_END = 'sticky right-0 bg-card shadow-[-8px_0_8px_-8px_rgb(0_0_0/0.08)]';

/**
 * Timesheet preset: a scrolling DsTable from `md` up (pass `head` / `body`
 * rows) and a card list on phones (pass `cards` as <DsCardItem>s).
 */
export function TimesheetTable({
  label,
  caption,
  minWidth = 860,
  head,
  body,
  cards,
  testId,
}: {
  label: string;
  caption?: ReactNode;
  minWidth?: number;
  head: ReactNode;
  body: ReactNode;
  cards: ReactNode;
  testId?: string;
}) {
  return (
    <ResponsiveTable
      table={
        <DsTable label={label} caption={caption} minWidth={minWidth} testId={testId}>
          <DsTHead>{head}</DsTHead>
          <DsTBody>{body}</DsTBody>
        </DsTable>
      }
      cards={<DsCardList label={label}>{cards}</DsCardList>}
    />
  );
}

import type { StatusTone } from '@/components/ui/status-dot';
import { statusTone } from '@/lib/ui/status-tone';
import { cn } from '@/lib/utils';
import { DS_PILL, type DsTone } from './tones';

/** Compact uppercase status pill used on Stage 6G cards and tables. */
export function DsStatusPill({
  tone,
  children,
  className,
}: {
  tone: DsTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide ring-1 ring-inset',
        DS_PILL[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const FROM_STATUS_TONE: Record<StatusTone, DsTone> = {
  success: 'green',
  info: 'blue',
  warning: 'amber',
  danger: 'rose',
  neutral: 'slate',
};

/** "TERMINATED_EARLY" → "Terminated early". */
export function enumLabel(value: string): string {
  const s = value.replace(/_/g, ' ').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Pill for any enum status, coloured from the CRM's central status-tone
 * map (src/lib/ui/status-tone.ts) so every module shows the same status in
 * the same colour.
 */
export function DsEnumPill({
  status,
  label,
  className,
}: {
  status: string;
  label?: string;
  className?: string;
}) {
  return (
    <DsStatusPill tone={FROM_STATUS_TONE[statusTone(status)]} className={className}>
      {label ?? enumLabel(status)}
    </DsStatusPill>
  );
}

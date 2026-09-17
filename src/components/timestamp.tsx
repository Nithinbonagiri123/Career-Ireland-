import { format, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

/**
 * Standard timestamp renderer for the CRM. Every date shown in the app
 * — table rows, activity feeds, printables, panel meta — is required to
 * carry the absolute date **and** time per the standing rule:
 *
 *   > "every fucking thing needs a timestamp — even the audit trail"
 *
 * Default layout is stacked (2 lines): a friendly relative label on
 * top ("3 days ago") and the exact clock time underneath ("12 Sep 2026
 * · 14:22"). Compact enough for a table cell, precise enough for a
 * dispute.
 *
 * Variants:
 *   - `inline`   → one line: "3 days ago · 12 Sep 2026 · 14:22".
 *   - `absoluteOnly` → drop the relative label (use when the container
 *                      already shows a relative bit like "Sent X ago").
 */
export function Timestamp({
  date,
  inline = false,
  absoluteOnly = false,
  className,
}: {
  date: Date | string;
  inline?: boolean;
  absoluteOnly?: boolean;
  className?: string;
}) {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) {
    return <span className={cn('text-xs text-muted-foreground', className)}>—</span>;
  }
  const abs = format(d, 'd MMM yyyy · HH:mm');
  const rel = formatDistanceToNow(d, { addSuffix: true });
  const iso = d.toISOString();

  if (absoluteOnly) {
    return (
      <time dateTime={iso} className={cn('text-xs text-muted-foreground', className)}>
        {abs}
      </time>
    );
  }
  if (inline) {
    return (
      <time dateTime={iso} className={cn('text-xs text-muted-foreground', className)}>
        {rel} · {abs}
      </time>
    );
  }
  return (
    <span className={cn('flex flex-col leading-tight', className)}>
      <span className="text-xs text-muted-foreground">{rel}</span>
      <time dateTime={iso} className="text-[10px] tabular-nums text-muted-foreground/70">
        {abs}
      </time>
    </span>
  );
}

import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import type { NoteTone } from '@/components/note';
import { AnimatedCounter } from '@/components/ui/animated-counter';
import type { StatusTone } from '@/components/ui/status-dot';
import { cn } from '@/lib/utils';

/**
 * Dense clickable KPI. Numbers spring in via the small client-only
 * <AnimatedCounter> so the dashboard feels alive on first paint; every
 * other effect (hover lift, icon medallion swap, tone underline) is
 * pure CSS so this whole card stays a Server Component. That lets
 * callers (Server Components) pass `icon={Users}` without tripping the
 * RSC "functions cannot be passed to Client Components" barrier.
 *
 * Two colour modes:
 *   - `noteTone` (new): the whole card is a coloured sticky-note tile,
 *     using the note-{yellow|blue|pink|green|purple|neutral} tokens.
 *     Use for grouped KPI walls where each tile has semantic tone.
 *   - `tone` (existing): status-{warning|danger|…} ring + accent, used
 *     to draw attention to an alerting KPI on a neutral background.
 */
export function StatChip({
  label,
  value,
  hint,
  href,
  icon: Icon,
  tone,
  noteTone,
}: {
  label: string;
  value: number | string;
  hint?: string;
  href: string;
  icon: LucideIcon;
  tone?: StatusTone;
  noteTone?: NoteTone;
}) {
  const numeric = typeof value === 'number' ? value : Number(value);
  const isNumeric = !Number.isNaN(numeric);
  const showTone = tone && isNumeric && numeric > 0;

  const noteClass = noteTone
    ? {
        yellow: 'bg-note-yellow text-note-yellow-ink ring-note-yellow-ink/10',
        blue: 'bg-note-blue text-note-blue-ink ring-note-blue-ink/10',
        pink: 'bg-note-pink text-note-pink-ink ring-note-pink-ink/10',
        green: 'bg-note-green text-note-green-ink ring-note-green-ink/10',
        purple: 'bg-note-purple text-note-purple-ink ring-note-purple-ink/10',
        neutral: 'bg-note-neutral text-note-neutral-ink ring-note-neutral-ink/10',
      }[noteTone]
    : null;

  return (
    <Link
      href={href}
      className="group relative block outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      <div
        className={cn(
          'relative flex flex-col justify-between overflow-hidden rounded-2xl px-4 py-3.5 shadow-sm ring-1 transition-all duration-200 ease-out',
          noteClass
            ? [noteClass, 'group-hover:-translate-y-0.5 group-hover:shadow-md']
            : [
                'border bg-card ring-transparent',
                'group-hover:-translate-y-0.5 group-hover:border-foreground/25 group-hover:bg-card/95 group-hover:shadow-[0_8px_20px_-10px_oklch(0.185_0.012_60/0.15)]',
              ],
          !noteTone && showTone && tone === 'warning' && 'ring-1 ring-inset ring-status-warning/30',
          !noteTone && showTone && tone === 'danger' && 'ring-1 ring-inset ring-status-danger/30',
        )}
      >
        <div className="flex items-center justify-between">
          <span
            className={cn(
              'text-[10.5px] font-medium uppercase tracking-wider',
              noteTone ? 'opacity-80' : 'text-muted-foreground',
            )}
          >
            {label}
          </span>
          <div
            className={cn(
              'flex size-6 items-center justify-center rounded-md transition-colors',
              noteTone
                ? 'bg-black/5 group-hover:bg-black/10'
                : 'bg-muted/50 group-hover:bg-muted',
              !noteTone &&
                showTone &&
                tone === 'warning' &&
                'bg-status-warning-soft group-hover:bg-status-warning-soft/80',
              !noteTone &&
                showTone &&
                tone === 'danger' &&
                'bg-status-danger-soft group-hover:bg-status-danger-soft/80',
              !noteTone &&
                showTone &&
                tone === 'info' &&
                'bg-status-info-soft group-hover:bg-status-info-soft/80',
              !noteTone &&
                showTone &&
                tone === 'success' &&
                'bg-status-success-soft group-hover:bg-status-success-soft/80',
            )}
          >
            <Icon
              aria-hidden
              className={cn(
                'size-3.5 transition-colors',
                noteTone && 'opacity-80',
                !noteTone && !showTone && 'text-muted-foreground group-hover:text-foreground',
                !noteTone && showTone && tone === 'warning' && 'text-status-warning',
                !noteTone && showTone && tone === 'danger' && 'text-status-danger',
                !noteTone && showTone && tone === 'info' && 'text-status-info',
                !noteTone && showTone && tone === 'success' && 'text-status-success',
              )}
            />
          </div>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-[26px] font-semibold leading-none tabular-nums tracking-tight">
            {isNumeric ? <AnimatedCounter value={numeric} /> : value}
          </span>
        </div>
        {hint && (
          <p
            className={cn(
              'mt-1 text-[11px] leading-snug',
              noteTone ? 'opacity-75' : 'text-muted-foreground',
            )}
          >
            {hint}
          </p>
        )}

        {/* Accent underline draws left-to-right on hover — subtle
            signal of interactivity in a way a plain border doesn't. */}
        <span
          aria-hidden
          className={cn(
            'absolute inset-x-4 bottom-0 h-[2px] origin-left scale-x-0 rounded-full transition-transform duration-300 ease-out group-hover:scale-x-100',
            noteTone ? 'bg-current/40' : 'bg-foreground/30',
            !noteTone && showTone && tone === 'warning' && 'bg-status-warning',
            !noteTone && showTone && tone === 'danger' && 'bg-status-danger',
            !noteTone && showTone && tone === 'info' && 'bg-status-info',
            !noteTone && showTone && tone === 'success' && 'bg-status-success',
          )}
        />
      </div>
    </Link>
  );
}

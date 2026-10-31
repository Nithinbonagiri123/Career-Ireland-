import { format } from 'date-fns';
import { ArrowLeft, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { FOCUS_RING } from './segmented';
import { DS_SOFT, type DsTone } from './tones';

/**
 * Header card for a finance document (invoice, receipt, pro forma, bill,
 * journal): breadcrumb, icon, "Kind NUMBER", status pill, the absolute
 * issued date + time, meta lines, and actions that wrap under the title on
 * phones instead of running off-screen. Hidden when printing — the
 * printable carries its own header.
 */
export function DocumentHeader({
  breadcrumbs,
  back,
  icon: Icon,
  tone = 'blue',
  kind,
  number,
  status,
  issuedAt,
  issuedLabel = 'Issued',
  meta = [],
  actions,
  overflow,
  className,
}: {
  breadcrumbs?: Array<{ label: string; href?: string }>;
  /** Back link shown above the card, e.g. { href, label: 'Back to billing' }. */
  back?: { href: string; label: string };
  icon: LucideIcon;
  tone?: DsTone;
  /** "Invoice", "Receipt", "Pro forma", "Bill", "Journal"… */
  kind: string;
  number: string;
  status?: ReactNode;
  /** Absolute timestamp, rendered "30 Oct 2026 · 22:30". */
  issuedAt?: Date | null;
  issuedLabel?: string;
  meta?: ReactNode[];
  /** Primary actions — wrap on narrow screens. */
  actions?: ReactNode;
  /** Optional overflow menu trigger placed after the actions. */
  overflow?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('min-w-0 print:hidden', className)}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-3 text-sm text-muted-foreground">
          <ol className="flex flex-wrap items-center gap-1.5">
            {breadcrumbs.map((b, i) => (
              <li key={b.href ?? b.label} className="flex min-w-0 items-center gap-1.5">
                {i > 0 && <span aria-hidden>/</span>}
                {b.href ? (
                  <Link
                    href={b.href}
                    className={cn('rounded-sm hover:text-foreground hover:underline', FOCUS_RING)}
                  >
                    {b.label}
                  </Link>
                ) : (
                  <span aria-current="page" className="truncate font-medium text-foreground">
                    {b.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
      {back && (
        <Link
          href={back.href}
          className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), '-ml-2 mb-2')}
        >
          <ArrowLeft className="mr-1.5 size-4" aria-hidden /> {back.label}
        </Link>
      )}
      <div className="@container rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 @2xl:flex-row @2xl:items-start @2xl:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span
              aria-hidden
              className={cn('grid size-12 shrink-0 place-items-center rounded-xl', DS_SOFT[tone])}
            >
              <Icon className="size-5" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h1 className="text-lg font-semibold text-foreground [overflow-wrap:anywhere]">
                  {kind} <span className="text-sky-800 dark:text-sky-300">{number}</span>
                </h1>
                {status}
              </div>
              {issuedAt && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {issuedLabel} on{' '}
                  <time dateTime={issuedAt.toISOString()}>
                    {format(issuedAt, 'dd MMM yyyy · HH:mm')}
                  </time>
                </p>
              )}
              {meta.map((m, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: static, order-stable meta lines
                <div key={i} className="mt-0.5 max-w-prose text-xs text-muted-foreground">
                  {m}
                </div>
              ))}
            </div>
          </div>
          {(actions || overflow) && (
            <div className="flex min-w-0 flex-wrap items-center gap-2 @2xl:shrink-0 @2xl:justify-end">
              {actions}
              {overflow}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

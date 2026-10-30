import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { PerPageSelect } from './list-controls';
import { FOCUS_RING } from './segmented';

/** Slice a server-side list for the current page (1-based). */
export function paginate<T>(
  rows: T[],
  pageParam: string | undefined,
  perParam: string | undefined,
  perOptions: number[],
) {
  const per = perOptions.includes(Number(perParam)) ? Number(perParam) : (perOptions[0] ?? 12);
  const pages = Math.max(1, Math.ceil(rows.length / per));
  const page = Math.min(pages, Math.max(1, Number.parseInt(pageParam ?? '1', 10) || 1));
  const start = (page - 1) * per;
  return { items: rows.slice(start, start + per), page, pages, per, total: rows.length, start };
}

/**
 * Stage 6G pagination (approved mockup 03): "Showing 1 to 8 of 14 …",
 * prev / page numbers / next, per-page select. Links keep every other
 * query param.
 */
export function Pagination({
  basePath,
  params,
  page,
  pages,
  per,
  total,
  start,
  noun,
  perOptions,
}: {
  basePath: string;
  params: Record<string, string | undefined>;
  page: number;
  pages: number;
  per: number;
  total: number;
  start: number;
  noun: string;
  perOptions: number[];
}) {
  if (total === 0) return null;
  const href = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== 'page') q.set(k, v);
    if (p > 1) q.set('page', String(p));
    const s = q.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  const numbers: Array<number | 'gap'> = [];
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || Math.abs(p - page) <= 1) numbers.push(p);
    else if (numbers[numbers.length - 1] !== 'gap') numbers.push('gap');
  }
  const btn = cn(
    'inline-grid size-9 place-items-center rounded-lg border border-border/60 bg-card text-sm shadow-sm transition-colors',
    FOCUS_RING,
  );
  return (
    <nav
      aria-label="Pagination"
      className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground"
    >
      <p aria-live="polite">
        Showing {start + 1} to {Math.min(start + per, total)} of {total} {noun}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {/* Phones: prev · "Page x of y" · next. Page numbers from sm up. */}
        {page > 1 ? (
          <Link
            href={href(page - 1)}
            aria-label="Previous page"
            className={cn(btn, 'hover:bg-muted')}
            scroll={false}
          >
            <ChevronLeft className="size-4" />
          </Link>
        ) : (
          <span aria-hidden className={cn(btn, 'opacity-40')}>
            <ChevronLeft className="size-4" />
          </span>
        )}
        {numbers.map((n, i) =>
          n === 'gap' ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: separators are positional
            <span key={`gap-${i}`} aria-hidden className="hidden px-1 sm:inline">
              …
            </span>
          ) : (
            <Link
              key={n}
              href={href(n)}
              aria-current={n === page ? 'page' : undefined}
              aria-label={`Page ${n}`}
              scroll={false}
              className={cn(
                btn,
                'hidden sm:inline-grid',
                n === page
                  ? 'border-primary bg-primary font-semibold text-primary-foreground'
                  : 'text-foreground hover:bg-muted',
              )}
            >
              {n}
            </Link>
          ),
        )}
        <span className="px-1.5 text-xs sm:hidden">
          Page {page} of {pages}
        </span>
        {page < pages ? (
          <Link
            href={href(page + 1)}
            aria-label="Next page"
            className={cn(btn, 'hover:bg-muted')}
            scroll={false}
          >
            <ChevronRight className="size-4" />
          </Link>
        ) : (
          <span aria-hidden className={cn(btn, 'opacity-40')}>
            <ChevronRight className="size-4" />
          </span>
        )}
        <span className="sm:ml-2">
          <PerPageSelect value={per} options={perOptions} />
        </span>
      </div>
    </nav>
  );
}

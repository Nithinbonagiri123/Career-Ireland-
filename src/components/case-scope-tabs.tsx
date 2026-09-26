'use client';

import { Globe, UserCheck } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { AssignmentScope } from '@/lib/scope';
import { cn } from '@/lib/utils';

/**
 * "My Cases" / "Global Cases" tab pair, per spec §1. Wraps the same URL
 * search param the generic ScopeFilter uses (`?assigned=me|all`) so the
 * server component picks up the same filter — no separate query.
 *
 * The generic ScopeFilter is still useful on non-case list pages
 * (candidates, employers, etc.) where "Unassigned" is a legit third
 * bucket. This pair is used on case-like modules where "Global" beats
 * "All" per the workflow spec's naming rules.
 */
export function CaseScopeTabs({
  current,
  className,
  myLabel = 'My Cases',
  globalLabel = 'Global Cases',
}: {
  current: AssignmentScope;
  className?: string;
  myLabel?: string;
  globalLabel?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const setScope = (next: 'mine' | 'all') => {
    const usp = new URLSearchParams(params?.toString() ?? '');
    if (next === 'all') usp.delete('assigned');
    else usp.set('assigned', next);
    const qs = usp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const isMine = current === 'mine';

  return (
    <div
      role="tablist"
      aria-label="Case scope"
      className={cn('inline-flex overflow-hidden rounded-md border', className)}
    >
      <button
        type="button"
        role="tab"
        aria-selected={isMine}
        onClick={() => setScope('mine')}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors',
          isMine
            ? 'bg-foreground text-background'
            : 'bg-transparent text-muted-foreground hover:bg-muted',
        )}
      >
        <UserCheck className="size-3.5" /> {myLabel}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={!isMine}
        onClick={() => setScope('all')}
        className={cn(
          'flex items-center gap-1.5 border-l px-3 py-1.5 text-xs font-medium transition-colors',
          !isMine
            ? 'bg-foreground text-background'
            : 'bg-transparent text-muted-foreground hover:bg-muted',
        )}
      >
        <Globe className="size-3.5" /> {globalLabel}
      </button>
    </div>
  );
}

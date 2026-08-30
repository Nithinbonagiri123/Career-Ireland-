'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ALL_SCOPES, type AssignmentScope, SCOPE_LABEL } from '@/lib/scope';
import { cn } from '@/lib/utils';

/**
 * URL-persisted filter chips. Writes `?assigned=me|unassigned|all` and lets
 * server components re-render with the new scope on click.
 */
export function ScopeFilter({
  current,
  className,
}: {
  current: AssignmentScope;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const setScope = (next: AssignmentScope) => {
    const usp = new URLSearchParams(params?.toString() ?? '');
    if (next === 'all') {
      usp.delete('assigned');
    } else {
      usp.set('assigned', next);
    }
    const qs = usp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  return (
    <div
      role="tablist"
      aria-label="Assignment filter"
      className={cn('inline-flex rounded-md border bg-card p-0.5 text-xs', className)}
    >
      {ALL_SCOPES.map((s) => {
        const active = s === current;
        return (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => setScope(s)}
            className={cn(
              'rounded px-2.5 py-1 transition-colors',
              active
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-accent/50',
            )}
          >
            {SCOPE_LABEL[s]}
          </button>
        );
      })}
    </div>
  );
}

'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ALL_SCOPES, type AssignmentScope, SCOPE_LABEL } from '@/lib/scope';
import { cn } from '@/lib/utils';
import { arrowKeyNav, SEG_TRAY, segItem } from './ds/segmented';

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
    // Session 35 — `mine` is the default when the param is absent, so
    // we drop it from the URL on the common path. Explicitly setting
    // `all` or `unassigned` writes the param.
    if (next === 'mine') {
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
      onKeyDown={(e) => arrowKeyNav(e)}
      className={cn(SEG_TRAY, className)}
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
            className={segItem(active)}
          >
            {SCOPE_LABEL[s]}
          </button>
        );
      })}
    </div>
  );
}

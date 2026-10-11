import { UserCheck } from 'lucide-react';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';

/**
 * Session 35 — contextual empty-state for list pages when the user has
 * nothing assigned to them.
 *
 * The default scope on every list page is `mine` (owner's call). That's
 * right for most sessions, but a brand-new operator who hasn't been
 * assigned anything yet would otherwise land on a blank list and think
 * the system is broken. This nudge explicitly says "nothing's assigned
 * to you yet — here's how to see everyone's" and points at the same
 * URL the ScopeFilter's "All" chip would navigate to.
 *
 * Server component — no client-side state. Caller renders this ONLY
 * when `scope === 'mine' && rows.length === 0`.
 */
export function EmptyMineNudge({
  resourceLabel,
  seeAllHref,
}: {
  /** Pluralised entity name, lowercase ("candidates", "employers"…). */
  resourceLabel: string;
  /** Href that switches the current list to the `all` scope. Usually
   *  the page's pathname with `?assigned=all` appended. */
  seeAllHref: string;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 rounded-lg border border-dashed border-border bg-muted/40 px-4 py-6 text-center sm:flex-row sm:items-center sm:gap-4 sm:text-left">
      <div className="mx-auto flex size-10 shrink-0 items-center justify-center rounded-full bg-background text-muted-foreground sm:mx-0">
        <UserCheck className="size-5" />
      </div>
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm font-medium">No {resourceLabel} assigned to you</p>
        <p className="text-xs text-muted-foreground">
          Lists default to showing just your work. If someone else owns {resourceLabel} you want to
          see, switch to the everyone-view.
        </p>
      </div>
      <Link
        href={seeAllHref}
        className={`${buttonVariants({ variant: 'outline', size: 'sm' })} mx-auto sm:mx-0`}
      >
        See everyone's
      </Link>
    </div>
  );
}

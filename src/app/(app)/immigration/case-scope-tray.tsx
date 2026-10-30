'use client';

import { Globe, UserCheck } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { arrowKeyNav, SEG_TRAY, segItem } from '@/components/ds/segmented';
import type { AssignmentScope } from '@/lib/scope';

/**
 * Stage 6G "My Cases" / "Global Cases" scope control on the shared kit tray.
 * Same URL contract as before (`assigned` absent = mine, `assigned=all` =
 * global) and the same tab roles and names the browser tests rely on.
 * Changing scope keeps every other filter but returns to page 1.
 */
export function CaseScopeTray({ current }: { current: AssignmentScope }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const isMine = current === 'mine';

  const setScope = (next: 'mine' | 'all') => {
    const usp = new URLSearchParams(params?.toString() ?? '');
    if (next === 'mine') usp.delete('assigned');
    else usp.set('assigned', next);
    usp.delete('page');
    const qs = usp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <div
      role="tablist"
      aria-label="Case scope"
      onKeyDown={(e) => arrowKeyNav(e)}
      className={SEG_TRAY}
    >
      <button
        type="button"
        role="tab"
        aria-selected={isMine}
        onClick={() => setScope('mine')}
        className={segItem(isMine)}
      >
        <UserCheck className="size-3.5" aria-hidden /> My Cases
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={!isMine}
        onClick={() => setScope('all')}
        className={segItem(!isMine)}
      >
        <Globe className="size-3.5" aria-hidden /> Global Cases
      </button>
    </div>
  );
}

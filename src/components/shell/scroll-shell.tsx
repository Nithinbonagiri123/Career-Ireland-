'use client';

import { usePathname } from 'next/navigation';
import { type ReactNode, useLayoutEffect, useRef } from 'react';

/**
 * The workspace content scroll container.
 *
 * Wrapped as a client component so we can reset its scroll to the top
 * whenever the route changes — the parent layout doesn't remount on
 * client-side navigation, so this `<main>` retains its scrollTop across
 * navigations by default. Next.js's built-in scroll-to-top behaviour
 * only touches `window.scrollTo`, not internal scroll containers.
 *
 * The parent `(app)/layout.tsx` pins the shell to `h-screen` +
 * `overflow-hidden` so this `<main>` has a bounded height and its
 * `overflow-y-auto` actually kicks in. Otherwise the whole window
 * scrolls and the sidebar visibly rides up with the page on nav.
 *
 * `useLayoutEffect` (not `useEffect`) is important: the reset needs
 * to happen BEFORE the browser paints the new page, otherwise the
 * user briefly sees the new content at the old scroll position
 * before it snaps to top.
 */
export function ScrollShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const ref = useRef<HTMLElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional — reset on pathname change only
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname]);

  return (
    <main ref={ref} className="relative flex-1 overflow-y-auto">
      {/* No opaque overlays — the workspace photo shows through, and
          the frosted card/table surfaces provide the readability. */}
      <div className="relative z-10">{children}</div>
    </main>
  );
}

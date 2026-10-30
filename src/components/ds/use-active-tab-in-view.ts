'use client';

import { type RefObject, useEffect } from 'react';

/**
 * Keeps the selected tab visible inside a horizontally scrolling tab strip
 * (phones). Scrolls the strip only — never the page — so deep links such as
 * `?tab=activity` open with the active tab in view.
 */
export function useActiveTabInView(wrapRef: RefObject<HTMLElement | null>, value: string) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run when the tab changes
  useEffect(() => {
    const wrap = wrapRef.current;
    const list = wrap?.querySelector<HTMLElement>('[role="tablist"]');
    const tab = list?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    if (!list || !tab || list.scrollWidth <= list.clientWidth) return;
    const left = tab.offsetLeft - (list.clientWidth - tab.offsetWidth) / 2;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    list.scrollTo({ left: Math.max(0, left), behavior: reduce ? 'auto' : 'smooth' });
  }, [value]);
}

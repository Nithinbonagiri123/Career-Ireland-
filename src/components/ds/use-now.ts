'use client';

import { useEffect, useState } from 'react';

/** Wall clock that re-renders every `everyMs` while `active` (for elapsed times). */
export function useNow(everyMs = 30_000, active = true): Date {
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(new Date()), everyMs);
    return () => clearInterval(t);
  }, [everyMs, active]);
  return now;
}

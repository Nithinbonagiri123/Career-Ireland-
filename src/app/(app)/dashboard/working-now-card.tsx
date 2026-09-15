'use client';

import { formatDistanceToNowStrict } from 'date-fns';
import { AnimatePresence, motion } from 'framer-motion';
import { Coffee, PlayCircle, Users2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { easeStandard } from '@/components/motion/motion-primitives';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusDot } from '@/components/ui/status-dot';
import type { WorkingNowRow } from '@/modules/hr/service';

/**
 * Owner's at-a-glance "who's working right now" card for the Main
 * Dashboard. Server component fetches the initial list; client re-
 * renders elapsed times every 30s so the durations stay honest without
 * a database round-trip per tick.
 *
 * Ordered by clock-in time ascending: earliest arrivers on top matches
 * a punch-card mental model.
 */
export function WorkingNowCard({ initial }: { initial: WorkingNowRow[] }) {
  // `now` is only used to force a re-render every 30s so the
  // `formatDistanceToNowStrict` calls below recompute against the
  // wall clock. We don't need to read it — just triggering setState
  // is enough.
  const [, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    if (initial.length === 0) return;
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, [initial.length]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Users2 className="size-4 text-muted-foreground" aria-hidden />
            Who's working now
          </CardTitle>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {initial.length} active
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {initial.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            No one is clocked in right now.
          </p>
        ) : (
          <ul className="divide-y">
            <AnimatePresence initial={false}>
              {initial.map((r, idx) => {
                const elapsed = formatDistanceToNowStrict(r.clockInAt, { addSuffix: false });
                const isOnBreak = r.onBreakSince !== null;
                return (
                  <motion.li
                    key={r.userId}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2, ease: easeStandard, delay: idx * 0.02 }}
                    className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <StatusDot tone={isOnBreak ? 'warning' : 'success'} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{r.fullName}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {isOnBreak ? (
                            <>
                              <Coffee className="mr-0.5 inline size-3" aria-hidden />
                              on break · {formatDistanceToNowStrict(r.onBreakSince as Date)}
                            </>
                          ) : (
                            <>
                              <PlayCircle className="mr-0.5 inline size-3" aria-hidden />
                              working · {elapsed}
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="text-right text-[10px] uppercase tracking-wider text-muted-foreground">
                      since{' '}
                      {new Intl.DateTimeFormat('en-IE', {
                        hour: '2-digit',
                        minute: '2-digit',
                      }).format(r.clockInAt)}
                    </div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

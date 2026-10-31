'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Users2 } from 'lucide-react';
import { AttendanceStatePill, DateTime, RunningDuration } from '@/components/ds/attendance';
import { useNow } from '@/components/ds/use-now';
import { DS_ROW, DS_ROW_LIST, SectionCard } from '@/components/ds/workspace';
import { easeStandard } from '@/components/motion/motion-primitives';
import type { WorkingNowRow } from '@/modules/hr/service';

/**
 * "Who's working now" for HR viewers on the Main Dashboard (the parent
 * only fetches and renders it for main.hr_board.view). Earliest arrivers
 * first. Times are absolute; the elapsed figure refreshes every 30s.
 */
export function WorkingNowCard({ initial }: { initial: WorkingNowRow[] }) {
  const now = useNow(30_000, initial.length > 0);
  const reduce = useReducedMotion();

  return (
    <SectionCard
      icon={Users2}
      title="Who's working now"
      count={initial.length}
      testId="working-now-card"
    >
      {initial.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No one is clocked in right now.
        </p>
      ) : (
        <ul aria-label="Who's working now" className={DS_ROW_LIST}>
          <AnimatePresence initial={false}>
            {initial.map((r, idx) => {
              const onBreak = r.onBreakSince !== null;
              return (
                <motion.li
                  key={r.userId}
                  layout={!reduce}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{
                    duration: reduce ? 0 : 0.2,
                    ease: easeStandard,
                    delay: reduce ? 0 : idx * 0.02,
                  }}
                  className={DS_ROW}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{r.fullName}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {onBreak && r.onBreakSince ? (
                        <>
                          Break since <DateTime value={r.onBreakSince} />
                        </>
                      ) : (
                        <RunningDuration since={r.clockInAt} now={now} />
                      )}
                    </p>
                  </div>
                  <AttendanceStatePill state={onBreak ? 'on_break' : 'working'} />
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </SectionCard>
  );
}

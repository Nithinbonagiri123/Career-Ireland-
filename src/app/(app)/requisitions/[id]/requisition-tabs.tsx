'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, useRef } from 'react';
import { useActiveTabInView } from '@/components/ds/use-active-tab-in-view';
import { DS_TAB_COUNT, DS_TAB_TRIGGER, DS_TABS_LIST } from '@/components/ds/workspace';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

/**
 * Client boundary for the job requirement workspace's tab state.
 *
 * R0 — the tabs honour `?tab=` and write the choice back to the URL so
 * back/forward, sharing and bookmarks work.
 * R2 — seven tabs in the R1 workspace treatment. Bookmark compatibility:
 * no `?tab=` still means Pipeline, and the existing values `pipeline`,
 * `overview` and `checklists` keep their meaning (R1 employer rows and
 * next-action buttons link to `?tab=pipeline`).
 */
export const REQUISITION_TAB_VALUES = [
  'pipeline',
  'overview',
  'seats',
  'interviews',
  'checklists',
  'billing',
  'activity',
] as const;
type TabValue = (typeof REQUISITION_TAB_VALUES)[number];

const LABELS: Record<TabValue, string> = {
  pipeline: 'Pipeline',
  overview: 'Overview',
  seats: 'Seats & placements',
  interviews: 'Interviews & offers',
  checklists: 'Checklists',
  billing: 'Billing',
  activity: 'Activity',
};

export function RequisitionTabs({
  panels,
  counts,
}: {
  panels: Record<TabValue, ReactNode>;
  counts: Partial<Record<TabValue, number>>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requested = searchParams.get('tab');
  const active: TabValue = REQUISITION_TAB_VALUES.includes(requested as TabValue)
    ? (requested as TabValue)
    : 'pipeline';
  const stripRef = useRef<HTMLDivElement>(null);
  useActiveTabInView(stripRef, active);
  return (
    <Tabs
      value={active}
      onValueChange={(next) => {
        const params = new URLSearchParams(searchParams.toString());
        if (next === 'pipeline') params.delete('tab');
        else params.set('tab', String(next));
        // Paging belongs to the activity tab only.
        if (next !== 'activity') params.delete('activityPage');
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      }}
    >
      <div>
        <div ref={stripRef}>
          <TabsList className={DS_TABS_LIST}>
            {REQUISITION_TAB_VALUES.map((v) => (
              <TabsTrigger key={v} value={v} className={DS_TAB_TRIGGER}>
                {LABELS[v]}
                {typeof counts[v] === 'number' && <span className={DS_TAB_COUNT}>{counts[v]}</span>}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </div>
      {REQUISITION_TAB_VALUES.map((v) => (
        <TabsContent key={v} value={v}>
          {panels[v]}
        </TabsContent>
      ))}
    </Tabs>
  );
}

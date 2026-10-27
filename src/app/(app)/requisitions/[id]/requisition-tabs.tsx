'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

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

// Same pill-tab tray as the R1 employer workspace.
const triggerClass = cn(
  'relative inline-flex h-11 shrink-0 items-center rounded-lg px-4 text-sm font-medium text-muted-foreground transition-colors',
  'hover:text-foreground',
  'data-[selected]:text-primary',
  'after:absolute after:inset-x-3 after:bottom-0.5 after:h-0.5 after:rounded-full after:bg-transparent data-[selected]:after:bg-primary',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
);

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
        <TabsList className="h-auto max-w-full gap-1 overflow-x-auto rounded-2xl border-0 bg-card p-1.5 shadow-sm ring-1 ring-border/60 [&>[data-slot=indicator]]:hidden">
          {REQUISITION_TAB_VALUES.map((v) => (
            <TabsTrigger key={v} value={v} className={triggerClass}>
              {LABELS[v]}
              {typeof counts[v] === 'number' && (
                <span className="ml-1 rounded-full bg-muted px-1.5 text-[10px] tabular-nums text-muted-foreground">
                  {counts[v]}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {REQUISITION_TAB_VALUES.map((v) => (
        <TabsContent key={v} value={v} className="mt-5">
          {panels[v]}
        </TabsContent>
      ))}
    </Tabs>
  );
}

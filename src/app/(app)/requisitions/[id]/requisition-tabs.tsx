'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

/**
 * Client boundary for the requisition detail page's tab state.
 *
 * The tab set was collapsed from four surface tabs (Matches / Shortlist
 * / Applications / Checklists) to three, replacing the first three with
 * the unified **Pipeline** tab (the Pipeline Wall). Overview and
 * Checklists stay as they were.
 *
 * R0 — the tabs now honour `?tab=` (deep links from requisition cards,
 * next-action buttons and bookmarks used to be silently ignored) and
 * write the choice back to the URL so back/forward and sharing work.
 */
const TAB_VALUES = ['pipeline', 'overview', 'checklists'] as const;
type TabValue = (typeof TAB_VALUES)[number];

export function RequisitionTabs({
  overview,
  pipeline,
  checklists,
  counts,
}: {
  overview: ReactNode;
  pipeline: ReactNode;
  checklists: ReactNode;
  counts: {
    pipeline: number;
    checklists: number;
  };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requested = searchParams.get('tab');
  const active: TabValue = TAB_VALUES.includes(requested as TabValue)
    ? (requested as TabValue)
    : 'pipeline';
  return (
    <Tabs
      value={active}
      onValueChange={(next) => {
        const params = new URLSearchParams(searchParams.toString());
        if (next === 'pipeline') params.delete('tab');
        else params.set('tab', next);
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      }}
    >
      <TabsList>
        <TabsTrigger value="pipeline">
          Pipeline
          <span className="ml-1 rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">
            {counts.pipeline}
          </span>
        </TabsTrigger>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="checklists">
          Checklists
          <span className="ml-1 rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">
            {counts.checklists}
          </span>
        </TabsTrigger>
      </TabsList>
      <TabsContent value="pipeline">{pipeline}</TabsContent>
      <TabsContent value="overview">{overview}</TabsContent>
      <TabsContent value="checklists">{checklists}</TabsContent>
    </Tabs>
  );
}

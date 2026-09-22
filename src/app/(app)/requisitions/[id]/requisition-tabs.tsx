'use client';

import type { ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

/**
 * Client boundary for the requisition detail page's tab state.
 *
 * The tab set was collapsed from four surface tabs (Matches / Shortlist
 * / Applications / Checklists) to three, replacing the first three with
 * the unified **Pipeline** tab (the Pipeline Wall). Overview and
 * Checklists stay as they were.
 */
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
  return (
    <Tabs defaultValue="pipeline">
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

'use client';

import type { ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

/**
 * Client boundary for the requisition detail page's tab state. The
 * server component still fetches all data; each tab's content is passed
 * in as a ReactNode. Match badges are optional trailing counts.
 */
export function RequisitionTabs({
  overview,
  matches,
  shortlist,
  applications,
  counts,
}: {
  overview: ReactNode;
  matches: ReactNode;
  shortlist: ReactNode;
  applications: ReactNode;
  counts: {
    matches: number;
    shortlist: number;
    applications: number;
  };
}) {
  return (
    <Tabs defaultValue="overview">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="matches">
          Matches
          <span className="ml-1 rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">
            {counts.matches}
          </span>
        </TabsTrigger>
        <TabsTrigger value="shortlist">
          Shortlist
          <span className="ml-1 rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">
            {counts.shortlist}
          </span>
        </TabsTrigger>
        <TabsTrigger value="applications">
          Applications
          <span className="ml-1 rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">
            {counts.applications}
          </span>
        </TabsTrigger>
      </TabsList>
      <TabsContent value="overview">{overview}</TabsContent>
      <TabsContent value="matches">{matches}</TabsContent>
      <TabsContent value="shortlist">{shortlist}</TabsContent>
      <TabsContent value="applications">{applications}</TabsContent>
    </Tabs>
  );
}

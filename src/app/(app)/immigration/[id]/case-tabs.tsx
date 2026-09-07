'use client';

import type { ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

/**
 * Client boundary for the immigration case detail page. Same pattern
 * as the candidate + requisition tabs — server component fetches
 * everything, each tab receives a ReactNode.
 */
export function CaseTabs({
  overview,
  documents,
  tasks,
  counts,
}: {
  overview: ReactNode;
  documents: ReactNode;
  tasks: ReactNode;
  counts: {
    documents: number;
    tasks: number;
  };
}) {
  return (
    <Tabs defaultValue="overview">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="documents">
          Documents
          <span className="ml-1 rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">
            {counts.documents}
          </span>
        </TabsTrigger>
        <TabsTrigger value="tasks">
          Tasks
          <span className="ml-1 rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">
            {counts.tasks}
          </span>
        </TabsTrigger>
      </TabsList>
      <TabsContent value="overview">{overview}</TabsContent>
      <TabsContent value="documents">{documents}</TabsContent>
      <TabsContent value="tasks">{tasks}</TabsContent>
    </Tabs>
  );
}

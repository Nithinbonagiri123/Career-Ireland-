'use client';

import type { ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

/**
 * Tabbed body for the candidate detail page. Server component fetches
 * everything up front and passes each tab's content as a ReactNode — the
 * client boundary is here only so the tabs can hold selection state.
 *
 * URL synchronisation is intentionally out of scope for V1: switching a
 * tab does not push to history. If we grow past four tabs or want
 * shareable deep-links, promote `defaultValue` to a controlled prop
 * driven by useSearchParams.
 */
export function CandidateTabs({
  overview,
  applications,
  documents,
  activity,
}: {
  overview: ReactNode;
  applications: ReactNode;
  documents: ReactNode;
  activity: ReactNode;
}) {
  return (
    <Tabs defaultValue="overview">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="applications">Applications</TabsTrigger>
        <TabsTrigger value="documents">Documents</TabsTrigger>
        <TabsTrigger value="activity">Activity</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">{overview}</TabsContent>
      <TabsContent value="applications">{applications}</TabsContent>
      <TabsContent value="documents">{documents}</TabsContent>
      <TabsContent value="activity">{activity}</TabsContent>
    </Tabs>
  );
}

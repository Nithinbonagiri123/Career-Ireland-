'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

/**
 * Client-side tab shell for the Client Workspace. Keeps the active tab in
 * the URL (`?tab=`) so refreshes + back/forward preserve the view and the
 * server-side primary-action resolver can link into a specific tab from
 * elsewhere (e.g. "Open billing" on the dashboard).
 *
 * Stage 6D Wave 2 — Applications + candidate-level Documents are added
 * so the operational detail is reachable without leaving the workspace.
 * The parent page lazy-loads those server queries only when the matching
 * tab is active.
 */
export function ClientWorkspaceTabs({
  overview,
  billing,
  documents,
  applications,
  documentsCandidate,
  activity,
}: {
  overview: ReactNode;
  billing: ReactNode;
  documents: ReactNode;
  applications: ReactNode;
  documentsCandidate: ReactNode;
  activity: ReactNode;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const current = params.get('tab') ?? 'overview';
  function onChange(next: string) {
    const sp = new URLSearchParams(params.toString());
    if (next === 'overview') sp.delete('tab');
    else sp.set('tab', next);
    const qs = sp.toString();
    router.replace(qs ? `?${qs}` : '?', { scroll: false });
  }
  return (
    <Tabs value={current} onValueChange={(v) => onChange(v)}>
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="billing">Billing</TabsTrigger>
        <TabsTrigger value="applications">Applications</TabsTrigger>
        <TabsTrigger value="documents-candidate">Candidate docs</TabsTrigger>
        <TabsTrigger value="documents">Financial docs</TabsTrigger>
        <TabsTrigger value="activity">Activity</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">{overview}</TabsContent>
      <TabsContent value="billing">{billing}</TabsContent>
      <TabsContent value="applications">{applications}</TabsContent>
      <TabsContent value="documents-candidate">{documentsCandidate}</TabsContent>
      <TabsContent value="documents">{documents}</TabsContent>
      <TabsContent value="activity">{activity}</TabsContent>
    </Tabs>
  );
}

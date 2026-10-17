'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

/**
 * Client-side tab shell for the Client Workspace. Keeps the active tab in
 * the URL (`?tab=`) so refreshes + back/forward preserve the view and the
 * server-side primary-action resolver can link into a specific tab from
 * elsewhere (e.g. "Open billing" on the dashboard).
 */
export function ClientWorkspaceTabs({
  overview,
  billing,
  documents,
  activity,
}: {
  overview: ReactNode;
  billing: ReactNode;
  documents: ReactNode;
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
        <TabsTrigger value="documents">Documents</TabsTrigger>
        <TabsTrigger value="activity">Activity</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">{overview}</TabsContent>
      <TabsContent value="billing">{billing}</TabsContent>
      <TabsContent value="documents">{documents}</TabsContent>
      <TabsContent value="activity">{activity}</TabsContent>
    </Tabs>
  );
}

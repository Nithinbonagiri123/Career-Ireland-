'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, useRef } from 'react';
import { useActiveTabInView } from '@/components/ds/use-active-tab-in-view';
import { DS_TAB_TRIGGER, DS_TABS_LIST } from '@/components/ds/workspace';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

/**
 * R1 — Employer Workspace tabs, the same approved Stage 6G treatment as
 * the Candidate Services client workspace: a white rounded tray of
 * plain-text labels, active tab in primary blue with an underline bar,
 * `?tab=` kept in sync for deep links and browser history.
 */

const TAB_ORDER = [
  'overview',
  'requirements',
  'contacts',
  'billing',
  'documents',
  'activity',
] as const;

const TAB_META: Record<(typeof TAB_ORDER)[number], { label: string }> = {
  overview: { label: 'Overview' },
  requirements: { label: 'Job requirements' },
  contacts: { label: 'Contacts' },
  billing: { label: 'Billing & VAT' },
  documents: { label: 'Documents' },
  activity: { label: 'Activity' },
};

export function EmployerWorkspaceTabs({
  overview,
  requirements,
  contacts,
  billing,
  documents,
  activity,
}: {
  overview: ReactNode;
  requirements: ReactNode;
  contacts: ReactNode;
  billing: ReactNode;
  documents: ReactNode;
  activity: ReactNode;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const raw = params.get('tab') ?? 'overview';
  const current = (TAB_ORDER as readonly string[]).includes(raw) ? raw : 'overview';
  const stripRef = useRef<HTMLDivElement>(null);
  useActiveTabInView(stripRef, current);

  function onChange(next: string) {
    const sp = new URLSearchParams(params.toString());
    if (next === 'overview') sp.delete('tab');
    else sp.set('tab', next);
    const qs = sp.toString();
    router.replace(qs ? `?${qs}` : '?', { scroll: false });
  }

  return (
    <Tabs value={current} onValueChange={onChange}>
      <div ref={stripRef}>
        <TabsList className={DS_TABS_LIST}>
          {TAB_ORDER.map((v) => (
            <TabsTrigger key={v} value={v} className={DS_TAB_TRIGGER}>
              {TAB_META[v].label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      <TabsContent value="overview">{overview}</TabsContent>
      <TabsContent value="requirements">{requirements}</TabsContent>
      <TabsContent value="contacts">{contacts}</TabsContent>
      <TabsContent value="billing">{billing}</TabsContent>
      <TabsContent value="documents">{documents}</TabsContent>
      <TabsContent value="activity">{activity}</TabsContent>
    </Tabs>
  );
}

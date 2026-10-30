'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, useRef } from 'react';
import { useActiveTabInView } from '@/components/ds/use-active-tab-in-view';
import { DS_TAB_COUNT, DS_TAB_TRIGGER, DS_TABS_LIST } from '@/components/ds/workspace';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

/**
 * Immigration case workspace tabs — the Stage 6G underlined strip, with
 * `?tab=` kept in sync so links such as the Next step "Open documents"
 * land on the right tab and browser history works.
 */

const TAB_ORDER = ['overview', 'documents', 'tasks'] as const;
type CaseTab = (typeof TAB_ORDER)[number];

const TAB_LABEL: Record<CaseTab, string> = {
  overview: 'Overview',
  documents: 'Documents',
  tasks: 'Tasks',
};

export function CaseTabs({
  overview,
  documents,
  tasks,
  counts,
}: {
  overview: ReactNode;
  documents: ReactNode;
  tasks: ReactNode;
  counts: { documents: number; tasks: number };
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

  const count: Partial<Record<CaseTab, number>> = {
    documents: counts.documents,
    tasks: counts.tasks,
  };

  return (
    <Tabs value={current} onValueChange={onChange}>
      <div ref={stripRef}>
        <TabsList className={DS_TABS_LIST}>
          {TAB_ORDER.map((v) => (
            <TabsTrigger key={v} value={v} className={DS_TAB_TRIGGER}>
              {TAB_LABEL[v]}
              {typeof count[v] === 'number' && <span className={DS_TAB_COUNT}>{count[v]}</span>}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      <TabsContent value="overview" className="mt-5">
        {overview}
      </TabsContent>
      <TabsContent value="documents" className="mt-5">
        {documents}
      </TabsContent>
      <TabsContent value="tasks" className="mt-5">
        {tasks}
      </TabsContent>
    </Tabs>
  );
}

'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

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

  function onChange(next: string) {
    const sp = new URLSearchParams(params.toString());
    if (next === 'overview') sp.delete('tab');
    else sp.set('tab', next);
    const qs = sp.toString();
    router.replace(qs ? `?${qs}` : '?', { scroll: false });
  }

  const triggerClass = cn(
    'relative inline-flex h-11 shrink-0 items-center rounded-lg px-4 text-sm font-medium text-muted-foreground transition-colors',
    'hover:text-foreground',
    'data-[selected]:text-primary',
    'after:absolute after:inset-x-3 after:bottom-0.5 after:h-0.5 after:rounded-full after:bg-transparent data-[selected]:after:bg-primary',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
  );

  return (
    <Tabs value={current} onValueChange={onChange}>
      <TabsList className="h-auto max-w-full gap-1 overflow-x-auto rounded-2xl border-0 bg-card p-1.5 shadow-sm ring-1 ring-border/60 [&>[data-slot=indicator]]:hidden">
        {TAB_ORDER.map((v) => (
          <TabsTrigger key={v} value={v} className={triggerClass}>
            {TAB_META[v].label}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="overview">{overview}</TabsContent>
      <TabsContent value="requirements">{requirements}</TabsContent>
      <TabsContent value="contacts">{contacts}</TabsContent>
      <TabsContent value="billing">{billing}</TabsContent>
      <TabsContent value="documents">{documents}</TabsContent>
      <TabsContent value="activity">{activity}</TabsContent>
    </Tabs>
  );
}

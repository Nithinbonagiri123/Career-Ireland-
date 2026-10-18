'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

/**
 * Stage 6G — Client Workspace tabs matching the approved mockup: a
 * white rounded tray of plain text labels (no icons); the active tab
 * is blue with a blue underline bar. Legacy `?tab=billing` /
 * `?tab=documents` still scroll to the Service Billing anchor at the
 * top of the page rather than silently landing on an unrelated tab.
 */

const TAB_META: Record<string, { label: string }> = {
  overview: { label: 'Overview' },
  profile: { label: 'Profile' },
  'documents-candidate': { label: 'Documents & CV' },
  'services-billing': { label: 'Services & Billing' },
  applications: { label: 'Applications' },
  activity: { label: 'Activity' },
};

export function ClientWorkspaceTabs({
  overview,
  profile,
  documentsCandidate,
  servicesBilling,
  applications,
  activity,
}: {
  overview: ReactNode;
  profile: ReactNode;
  documentsCandidate: ReactNode;
  servicesBilling: ReactNode;
  applications: ReactNode;
  activity: ReactNode;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const raw = params.get('tab') ?? 'overview';
  // Legacy `?tab=billing` / `?tab=documents` now land coherently on the
  // dedicated Services & Billing tab (promoted to a top-level tab per
  // the Stage 6G Screen 04 approved mockup).
  const current =
    raw === 'billing' || raw === 'documents'
      ? 'services-billing'
      : raw === 'service-billing'
        ? 'services-billing'
        : raw;

  useEffect(() => {
    if (raw !== 'billing' && raw !== 'documents' && raw !== 'service-billing') return;
    const target = document.getElementById('service-billing');
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [raw]);

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
    // Blue underline bar under the active label, per the mockup.
    'after:absolute after:inset-x-3 after:bottom-0.5 after:h-0.5 after:rounded-full after:bg-transparent data-[selected]:after:bg-primary',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
  );

  return (
    <Tabs value={current} onValueChange={(v) => onChange(v)}>
      {/* White rounded tray of plain-text tabs matching the mockup;
          the default TabsList underline indicator is hidden in favour
          of the per-trigger underline bar. */}
      <TabsList className="h-auto gap-1 rounded-2xl border-0 bg-card p-1.5 shadow-sm ring-1 ring-border/60 [&>[data-slot=indicator]]:hidden">
        {(
          [
            'overview',
            'profile',
            'documents-candidate',
            'services-billing',
            'applications',
            'activity',
          ] as const
        ).map((v) => (
          <TabsTrigger key={v} value={v} className={triggerClass}>
            {TAB_META[v]?.label ?? v}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="overview">{overview}</TabsContent>
      <TabsContent value="profile">{profile}</TabsContent>
      <TabsContent value="documents-candidate">{documentsCandidate}</TabsContent>
      <TabsContent value="services-billing">{servicesBilling}</TabsContent>
      <TabsContent value="applications">{applications}</TabsContent>
      <TabsContent value="activity">{activity}</TabsContent>
    </Tabs>
  );
}

'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, useEffect, useRef } from 'react';
import { useActiveTabInView } from '@/components/ds/use-active-tab-in-view';
import { DS_TAB_TRIGGER, DS_TABS_LIST } from '@/components/ds/workspace';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

/**
 * Stage 6G — Client Workspace tabs on the shared underlined strip
 * (DS_TABS_LIST / DS_TAB_TRIGGER); on phones the strip scrolls and keeps
 * the selected tab in view. Legacy `?tab=billing` /
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

  const stripRef = useRef<HTMLDivElement>(null);
  useActiveTabInView(stripRef, current);

  return (
    <Tabs value={current} onValueChange={(v) => onChange(v)}>
      {/* Stage 6G — the shared underlined tab strip (as in Recruitment).
          No counts here: specs match the tab names exactly. */}
      <div ref={stripRef}>
        <TabsList className={DS_TABS_LIST}>
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
            <TabsTrigger key={v} value={v} className={DS_TAB_TRIGGER}>
              {TAB_META[v]?.label ?? v}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      <TabsContent value="overview">{overview}</TabsContent>
      <TabsContent value="profile">{profile}</TabsContent>
      <TabsContent value="documents-candidate">{documentsCandidate}</TabsContent>
      <TabsContent value="services-billing">{servicesBilling}</TabsContent>
      <TabsContent value="applications">{applications}</TabsContent>
      <TabsContent value="activity">{activity}</TabsContent>
    </Tabs>
  );
}

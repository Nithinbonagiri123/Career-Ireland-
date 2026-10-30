'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { DS_TAB_COUNT, DS_TAB_TRIGGER, DS_TABS_LIST } from '@/components/ds/workspace';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

/** R4 — campaign workspace tabs, Stage 6G underlined tabs, same `?tab=` behaviour as the R1/R2 workspaces.
 *  No `?tab=` means Prospects (old /campaigns/<id> links land on the work). */
export const CAMPAIGN_TAB_VALUES = ['prospects', 'ads', 'overview', 'activity'] as const;
type TabValue = (typeof CAMPAIGN_TAB_VALUES)[number];

const LABELS: Record<TabValue, string> = {
  prospects: 'Prospects',
  ads: 'Advertisements',
  overview: 'Overview',
  activity: 'Activity',
};

export function CampaignTabs({
  panels,
  counts,
}: {
  panels: Record<TabValue, ReactNode>;
  counts: Partial<Record<TabValue, number>>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requested = searchParams.get('tab');
  const active: TabValue = CAMPAIGN_TAB_VALUES.includes(requested as TabValue)
    ? (requested as TabValue)
    : 'prospects';
  return (
    <Tabs
      value={active}
      onValueChange={(next) => {
        const params = new URLSearchParams(searchParams.toString());
        if (next === 'prospects') params.delete('tab');
        else params.set('tab', String(next));
        if (next !== 'activity') params.delete('activityPage');
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      }}
    >
      <TabsList className={DS_TABS_LIST}>
        {CAMPAIGN_TAB_VALUES.map((v) => (
          <TabsTrigger key={v} value={v} className={DS_TAB_TRIGGER}>
            {LABELS[v]}
            {typeof counts[v] === 'number' && <span className={DS_TAB_COUNT}>{counts[v]}</span>}
          </TabsTrigger>
        ))}
      </TabsList>
      {CAMPAIGN_TAB_VALUES.map((v) => (
        <TabsContent key={v} value={v}>
          {panels[v]}
        </TabsContent>
      ))}
    </Tabs>
  );
}

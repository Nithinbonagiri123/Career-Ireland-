'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

/** R4 — campaign workspace tabs, same tray and `?tab=` behaviour as the R1/R2 workspaces.
 *  No `?tab=` means Prospects (old /campaigns/<id> links land on the work). */
export const CAMPAIGN_TAB_VALUES = ['prospects', 'ads', 'overview', 'activity'] as const;
type TabValue = (typeof CAMPAIGN_TAB_VALUES)[number];

const LABELS: Record<TabValue, string> = {
  prospects: 'Prospects',
  ads: 'Advertisements',
  overview: 'Overview',
  activity: 'Activity',
};

const triggerClass = cn(
  'relative inline-flex h-11 shrink-0 items-center rounded-lg px-4 text-sm font-medium text-muted-foreground transition-colors',
  'hover:text-foreground',
  'data-[selected]:text-primary',
  'after:absolute after:inset-x-3 after:bottom-0.5 after:h-0.5 after:rounded-full after:bg-transparent data-[selected]:after:bg-primary',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
);

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
      <TabsList className="h-auto max-w-full gap-1 overflow-x-auto rounded-2xl border-0 bg-card p-1.5 shadow-sm ring-1 ring-border/60 [&>[data-slot=indicator]]:hidden">
        {CAMPAIGN_TAB_VALUES.map((v) => (
          <TabsTrigger key={v} value={v} className={triggerClass}>
            {LABELS[v]}
            {typeof counts[v] === 'number' && (
              <span className="ml-1.5 rounded-full bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground">
                {counts[v]}
              </span>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
      {CAMPAIGN_TAB_VALUES.map((v) => (
        <TabsContent key={v} value={v} className="mt-4">
          {panels[v]}
        </TabsContent>
      ))}
    </Tabs>
  );
}

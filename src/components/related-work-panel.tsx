import {
  Briefcase,
  CheckSquare,
  Coins,
  MessagesSquare,
  PlaneTakeoff,
  Trophy,
  UserPlus,
} from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { PersonTimelineItem } from '@/modules/persons/detail';

/**
 * Compact cross-module summary shown at the top of the candidate overview.
 *
 * Counts the person's leads / applications / placements / engagements /
 * payments / immigration cases / communications / tasks — surfaces the
 * cross-module context in one place, matching the spec's 'interlinked
 * business' goal (§10). Each row deep-links to the module's list page
 * pre-filtered (best effort — links land on the module's home page for
 * now, more targeted deep links are a later polish).
 *
 * Renders nothing when the person has no cross-module activity at all —
 * activation is the primary CTA in that case, not a bunch of zeros.
 */

type Counts = {
  lead: number;
  application: number;
  placement: number;
  engagement: number;
  immigration: number;
  communication: number;
  task: number;
};

function countByKind(items: PersonTimelineItem[]): Counts {
  const c: Counts = {
    lead: 0,
    application: 0,
    placement: 0,
    engagement: 0,
    immigration: 0,
    communication: 0,
    task: 0,
  };
  for (const item of items) {
    if (item.kind === 'payment') continue; // payments follow engagements — already visible via engagement count
    if (item.kind in c) c[item.kind as keyof Counts]++;
  }
  return c;
}

const ROW_ORDER: Array<{
  key: keyof Counts;
  label: string;
  icon: typeof Briefcase;
  href: (personId: string) => string;
}> = [
  { key: 'lead', label: 'leads', icon: UserPlus, href: () => '/leads' },
  { key: 'application', label: 'applications', icon: Briefcase, href: () => '/requisitions' },
  { key: 'placement', label: 'placements', icon: Trophy, href: () => '/placements' },
  {
    key: 'immigration',
    label: 'immigration cases',
    icon: PlaneTakeoff,
    href: () => '/immigration',
  },
  { key: 'engagement', label: 'service engagements', icon: Coins, href: () => '/engagements' },
  {
    key: 'communication',
    label: 'communications',
    icon: MessagesSquare,
    href: (id) => `/candidates/${id}?tab=activity`,
  },
  { key: 'task', label: 'open tasks', icon: CheckSquare, href: () => '/tasks' },
];

export function RelatedWorkPanel({
  personId,
  timeline,
}: {
  personId: string;
  timeline: PersonTimelineItem[];
}) {
  const counts = countByKind(timeline);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Related work</CardTitle>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Everywhere this candidate appears across the business.
        </p>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
        {ROW_ORDER.filter((row) => counts[row.key] > 0).map((row) => {
          const Icon = row.icon;
          return (
            <Link
              key={row.key}
              href={row.href(personId)}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-muted"
            >
              <Icon className="size-3.5 text-muted-foreground" />
              <span className="font-mono text-sm tabular-nums">{counts[row.key]}</span>
              <span className="truncate text-muted-foreground">{row.label}</span>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}

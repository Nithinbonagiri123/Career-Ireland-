import {
  Briefcase,
  Building2,
  CheckSquare,
  type LucideIcon,
  PlaneTakeoff,
  UserPlus,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { AnimatedCounter } from '@/components/ui/animated-counter';
import { cn } from '@/lib/utils';
import type { MyWorkCounts } from '@/modules/dashboard/my-work';

/**
 * Phase 1 blueprint §12.1 — the "My Work" section at the top of the
 * dashboard. Replaces the generic workspace stats as the first thing
 * every user sees in the morning with: "here's what's assigned to you
 * right now, click a card to see the list."
 *
 * Each card drills down to the matching list page with `?assigned=me`
 * so the user lands directly on their own work.
 */
export function MyWorkSection({ counts, userName }: { counts: MyWorkCounts; userName: string }) {
  const cards: Array<{
    label: string;
    count: number;
    href: string;
    icon: LucideIcon;
    hint?: string | null;
    emphasise?: boolean;
  }> = [
    {
      label: 'Candidates',
      count: counts.openCandidates,
      href: '/candidates?assigned=me',
      icon: Users,
    },
    {
      label: 'Leads',
      count: counts.openLeads,
      href: '/leads?assigned=me',
      icon: UserPlus,
    },
    {
      label: 'Requisitions',
      count: counts.openRequisitions,
      href: '/requisitions?assigned=me',
      icon: Briefcase,
    },
    {
      label: 'Companies',
      count: counts.openEmployers,
      href: '/employers?assigned=me',
      icon: Building2,
    },
    {
      label: 'Immigration cases',
      count: counts.openImmigrationCases,
      href: '/immigration?assigned=me',
      icon: PlaneTakeoff,
    },
    {
      label: 'Tasks',
      count: counts.openTasks,
      href: '/tasks',
      icon: CheckSquare,
      hint: counts.overdueTasks > 0 ? `${counts.overdueTasks} overdue` : null,
      emphasise: counts.overdueTasks > 0,
    },
  ];

  const totalOpen = cards.reduce((sum, c) => sum + c.count, 0);
  const greeting =
    totalOpen === 0
      ? `Nothing on your plate right now, ${userName.split(' ')[0] || 'there'} — nice.`
      : `${totalOpen} item${totalOpen === 1 ? '' : 's'} assigned to you.`;

  return (
    <section aria-label="My work" className="mb-6">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground/75">
            My work
          </h2>
          <p className="mt-0.5 text-[11px] text-foreground/60">{greeting}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className={cn(
              'group relative flex flex-col overflow-hidden rounded-lg border bg-card p-3 transition-shadow hover:shadow-sm',
              c.emphasise && 'border-amber-300 dark:border-amber-800/60',
            )}
          >
            <div className="flex items-center justify-between">
              <span
                className={cn(
                  'grid size-7 place-items-center rounded-md transition-transform group-hover:scale-110',
                  c.emphasise
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-100'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                <c.icon aria-hidden className="size-3.5" />
              </span>
              <span className="text-xl font-semibold leading-none tabular-nums text-foreground">
                <AnimatedCounter value={c.count} />
              </span>
            </div>
            <p className="mt-2 text-[11px] uppercase tracking-wide text-muted-foreground">
              {c.label}
            </p>
            {c.hint && (
              <p
                className={cn(
                  'mt-0.5 text-[10px]',
                  c.emphasise ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground',
                )}
              >
                {c.hint}
              </p>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}

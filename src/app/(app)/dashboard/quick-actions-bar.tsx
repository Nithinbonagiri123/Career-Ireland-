import { Bell, Briefcase, Building2, PlaneTakeoff, Plus, Receipt, UserPlus } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Dashboard-top row of task-starters. One primary slot (filled by the
 * caller — currently the New Lead dialog, the most common business
 * entry point) + six outlined links to the modules where each creation
 * dialog already lives. The restrained visual weight is deliberate —
 * the brief wants a quick-actions row, not a toolbar that shouts. See
 * docs/ux-redesign-audit.md §13.
 */

export function QuickActionsBar({ primary }: { primary: ReactNode }) {
  return (
    <section aria-label="Quick actions" className="mb-8">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-foreground/75">
        Start something new
      </h2>
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="shrink-0">{primary}</div>
        <SecondaryAction href="/candidates/new" icon={<UserPlus className="size-3.5" />}>
          Candidate
        </SecondaryAction>
        <SecondaryAction href="/employers" icon={<Building2 className="size-3.5" />}>
          Company
        </SecondaryAction>
        <SecondaryAction href="/requisitions" icon={<Briefcase className="size-3.5" />}>
          Requisition
        </SecondaryAction>
        <SecondaryAction href="/immigration" icon={<PlaneTakeoff className="size-3.5" />}>
          Case
        </SecondaryAction>
        <SecondaryAction href="/candidates" icon={<Receipt className="size-3.5" />}>
          Invoice
        </SecondaryAction>
        <SecondaryAction href="/tasks" icon={<Bell className="size-3.5" />}>
          Reminder
        </SecondaryAction>
      </div>
    </section>
  );
}

function SecondaryAction({
  href,
  icon,
  children,
}: {
  href: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        buttonVariants({ variant: 'outline', size: 'sm' }),
        'gap-1.5 text-muted-foreground hover:text-foreground',
      )}
    >
      <Plus className="size-3" aria-hidden />
      {icon}
      {children}
    </Link>
  );
}

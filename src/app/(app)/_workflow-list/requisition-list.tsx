import { ArrowRight, Briefcase } from 'lucide-react';
import Link from 'next/link';
import { EmptyState } from '@/components/empty-state';
import { Badge } from '@/components/ui/badge';
import type { RequisitionListRow } from '@/modules/requisitions/service';

/**
 * Shared list of requisitions used by the workflow index pages
 * (/matching, /shortlists, /applications). Each of those workflows lives
 * inside a specific requisition — this list is the "pick one" step.
 */
export function WorkflowRequisitionList({
  requisitions,
  emptyTitle,
  emptyDescription,
}: {
  requisitions: RequisitionListRow[];
  emptyTitle: string;
  emptyDescription: string;
}) {
  if (requisitions.length === 0) {
    return <EmptyState icon={Briefcase} title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <ul className="grid gap-2 md:grid-cols-2">
      {requisitions.map((r) => (
        <li key={r.id}>
          <Link
            href={`/requisitions/${r.id}`}
            className="glass-panel group flex items-start justify-between gap-4 rounded-lg px-4 py-3 transition-all hover:-translate-y-0.5 hover:shadow-[inset_0_1px_0_0_oklch(1_0_0/0.8),0_2px_4px_-1px_oklch(0.185_0.012_60/0.06),0_14px_32px_-12px_oklch(0.185_0.012_60/0.16)]"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Briefcase className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate text-sm font-medium">{r.title}</span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {r.employerName} · {r.positionsFilled} of {r.positionsRequired} filled
                {r.location ? ` · ${r.location}` : ''}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge variant="secondary" className="rounded-full text-[10px]">
                {r.status.replace(/_/g, ' ')}
              </Badge>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

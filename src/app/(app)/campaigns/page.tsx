import { Plus, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { DateRangeFilter } from '@/components/date-range-filter';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { checkPermission, requirePermission } from '@/lib/auth/session';
import { parseDateRangeParams } from '@/lib/date-range';
import { cn } from '@/lib/utils';
import { fetchCampaigns, fetchJobsForCampaignPicker } from '@/modules/campaigns/service';
import { CampaignFormDialog } from './campaign-dialog';
import { CampaignsTable } from './campaigns-table';

export const dynamic = 'force-dynamic';

const VIEWS = [
  { key: 'open', label: 'Draft, active & paused' },
  { key: 'active', label: 'Active' },
  { key: 'paused', label: 'Paused' },
  { key: 'draft', label: 'Draft' },
  { key: 'ended', label: 'Completed / cancelled' },
  { key: 'all', label: 'All' },
  { key: 'archived', label: 'Archived' },
] as const;
type View = (typeof VIEWS)[number]['key'];

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{
    created?: string;
    from?: string;
    to?: string;
    requisitionId?: string;
    view?: string;
  }>;
}) {
  await requirePermission('recruitment', 'campaigns', 'view');
  const sp = await searchParams;
  const createdRange = parseDateRangeParams({ created: sp.created, from: sp.from, to: sp.to });
  const view: View = VIEWS.some((v) => v.key === sp.view) ? (sp.view as View) : 'open';
  const [rows, canCreate] = await Promise.all([
    fetchCampaigns(createdRange, { archived: view === 'archived' }),
    checkPermission('recruitment', 'campaigns', 'create'),
  ]);
  const campaigns = rows.filter((c) => {
    switch (view) {
      case 'open':
        return c.status === 'DRAFT' || c.status === 'ACTIVE' || c.status === 'PAUSED';
      case 'paused':
        return c.status === 'PAUSED';
      case 'active':
        return c.status === 'ACTIVE';
      case 'draft':
        return c.status === 'DRAFT';
      case 'ended':
        return c.status === 'COMPLETED' || c.status === 'CANCELLED';
      default:
        return true;
    }
  });

  // "Start a campaign" from a job: open the dialog with that job chosen.
  let prefillJob = null;
  if (sp.requisitionId && canCreate) {
    const jobs = await fetchJobsForCampaignPicker();
    prefillJob = jobs.find((j) => j.id === sp.requisitionId) ?? null;
  }

  const href = (v: View) => {
    const p = new URLSearchParams();
    if (v !== 'open') p.set('view', v);
    if (sp.created) p.set('created', sp.created);
    if (sp.from) p.set('from', sp.from);
    if (sp.to) p.set('to', sp.to);
    const qs = p.toString();
    return qs ? `/campaigns?${qs}` : '/campaigns';
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={Sparkles}
          iconTone="pink"
          title="Recruitment campaigns"
          description="Advertising for jobs the existing pool cannot fill, or to grow the talent pool. Each campaign runs one advertisement per country or job board."
          action={
            <div className="flex flex-wrap items-center gap-2">
              <DateRangeFilter />
              {canCreate && (
                <CampaignFormDialog
                  prefillJob={prefillJob}
                  defaultOpen={Boolean(prefillJob)}
                  trigger={
                    <Button size="sm">
                      <Plus className="mr-1.5 size-4" /> New campaign
                    </Button>
                  }
                />
              )}
            </div>
          }
        />
      </FadeUp>
      <FadeUp delay={0.03}>
        <nav aria-label="Campaign status" className="mb-4 flex flex-wrap gap-1.5">
          {VIEWS.map((v) => (
            <Link
              key={v.key}
              href={href(v.key)}
              aria-current={view === v.key ? 'page' : undefined}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                view === v.key
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'bg-card text-muted-foreground hover:text-foreground',
              )}
            >
              {v.label}
            </Link>
          ))}
        </nav>
      </FadeUp>
      <FadeUp delay={0.05}>
        <CampaignsTable campaigns={campaigns} archivedView={view === 'archived'} />
      </FadeUp>
    </div>
  );
}

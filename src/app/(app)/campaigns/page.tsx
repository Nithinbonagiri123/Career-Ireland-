import { Sparkles } from 'lucide-react';
import { DateRangeFilter } from '@/components/date-range-filter';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { requireInternalStaff } from '@/lib/auth/session';
import { parseDateRangeParams } from '@/lib/date-range';
import { fetchCampaigns } from '@/modules/campaigns/service';
import { fetchRequisitions } from '@/modules/requisitions/service';
import { CampaignDialog } from './campaign-dialog';
import { CampaignsTable } from './campaigns-table';

export const dynamic = 'force-dynamic';

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; from?: string; to?: string }>;
}) {
  await requireInternalStaff();
  const { created, from, to } = await searchParams;
  const createdRange = parseDateRangeParams({ created, from, to });
  const [campaigns, requisitions] = await Promise.all([
    fetchCampaigns(createdRange),
    fetchRequisitions(),
  ]);

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={Sparkles}
          title="Recruitment campaigns"
          description="Advertising campaigns for requisitions the existing pool cannot fill. Ads can be per country (Ireland, South Africa)."
          action={
            <div className="flex flex-wrap items-center gap-2">
              <DateRangeFilter />
              <CampaignDialog
                requisitions={requisitions}
                trigger={<Button size="sm">New campaign</Button>}
              />
            </div>
          }
        />
      </FadeUp>
      <FadeUp delay={0.05}>
        <CampaignsTable campaigns={campaigns} />
      </FadeUp>
    </div>
  );
}

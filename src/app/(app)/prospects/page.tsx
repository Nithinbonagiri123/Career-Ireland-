import { Sparkles } from 'lucide-react';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { requireInternalStaff } from '@/lib/auth/session';
import { ProspectStatusSchema } from '@/modules/campaigns/schemas';
import {
  fetchCampaigns,
  fetchProspectCountries,
  fetchProspects,
} from '@/modules/campaigns/service';
import { ProspectsFilters } from './prospects-filters';
import { ProspectsTable } from './prospects-table';

export const dynamic = 'force-dynamic';

type SearchParams = {
  status?: string;
  campaign?: string;
  country?: string;
  q?: string;
};

export default async function ProspectsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireInternalStaff();
  const sp = await searchParams;

  const statusParsed = ProspectStatusSchema.safeParse(sp.status);
  const status = statusParsed.success ? statusParsed.data : undefined;
  const campaignId = sp.campaign && sp.campaign.length > 0 ? sp.campaign : undefined;
  const country = sp.country && sp.country.length > 0 ? sp.country : undefined;
  const q = sp.q && sp.q.trim().length > 0 ? sp.q.trim() : undefined;

  const [prospects, campaigns, countries] = await Promise.all([
    fetchProspects({ status, campaignId, country, q }),
    fetchCampaigns(),
    fetchProspectCountries(),
  ]);

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={Sparkles}
          title="Prospects"
          description="Everyone who responded to a campaign advertisement. Convert warm prospects into candidates as they clear screening."
        />
      </FadeUp>
      <FadeUp delay={0.05}>
        <ProspectsFilters
          campaigns={campaigns.map((c) => ({ id: c.id, name: c.name }))}
          countries={countries}
          active={{ status, campaignId, country, q }}
        />
      </FadeUp>
      <FadeUp delay={0.08}>
        <ProspectsTable prospects={prospects} />
      </FadeUp>
    </div>
  );
}

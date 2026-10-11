import { Coins } from 'lucide-react';
import { DateRangeFilter } from '@/components/date-range-filter';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { requirePermission } from '@/lib/auth/session';
import { parseDateRangeParams } from '@/lib/date-range';
import { fetchEngagements } from '@/modules/commerce/service';
import { fetchCurrencies } from '@/modules/currencies/service';
import { fetchPersons } from '@/modules/persons/service';
import { fetchServiceCatalog } from '@/modules/services-catalog/service';
import { fetchAppSettings } from '@/modules/settings/service';
import { CreateEngagementDialog } from './create-engagement-dialog';
import { EngagementsTable } from './engagements-table';

export const dynamic = 'force-dynamic';

export default async function EngagementsPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; from?: string; to?: string }>;
}) {
  await requirePermission('candidate_services', 'engagements', 'view');
  const { created, from, to } = await searchParams;
  const createdRange = parseDateRangeParams({ created, from, to });
  const [engagements, services, currencies, persons, settings] = await Promise.all([
    fetchEngagements(createdRange),
    fetchServiceCatalog(),
    fetchCurrencies(),
    fetchPersons(),
    fetchAppSettings(),
  ]);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={Coins}
          iconTone="green"
          title="Services"
          description={`Services ${settings.legalName} is delivering, with the money tied to each. Start a service here, then record payments against it as they land.`}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <DateRangeFilter />
              <CreateEngagementDialog
                services={services}
                currencies={currencies}
                persons={persons}
              />
            </div>
          }
        />
      </FadeUp>
      <FadeUp delay={0.05}>
        <EngagementsTable engagements={engagements} />
      </FadeUp>
    </div>
  );
}

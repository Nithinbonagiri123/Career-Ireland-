import { Coins } from 'lucide-react';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { requireInternalStaff } from '@/lib/auth/session';
import { fetchEngagements } from '@/modules/commerce/service';
import { fetchCurrencies } from '@/modules/currencies/service';
import { fetchPersons } from '@/modules/persons/service';
import { fetchServiceCatalog } from '@/modules/services-catalog/service';
import { CreateEngagementDialog } from './create-engagement-dialog';
import { EngagementsTable } from './engagements-table';

export const dynamic = 'force-dynamic';

export default async function EngagementsPage() {
  await requireInternalStaff();
  const [engagements, services, currencies, persons] = await Promise.all([
    fetchEngagements(),
    fetchServiceCatalog(),
    fetchCurrencies(),
    fetchPersons(),
  ]);

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={Coins}
          title="Service engagements"
          description="Commercial orders for Career Ireland services. Create an engagement first, then record payments against it."
          action={
            <CreateEngagementDialog services={services} currencies={currencies} persons={persons} />
          }
        />
      </FadeUp>
      <FadeUp delay={0.05}>
        <EngagementsTable engagements={engagements} />
      </FadeUp>
    </div>
  );
}

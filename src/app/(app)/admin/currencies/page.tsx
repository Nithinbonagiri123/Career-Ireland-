import { Globe, Plus } from 'lucide-react';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { requireRole } from '@/lib/auth/session';
import { fetchCurrencies } from '@/modules/currencies/service';
import { CurrenciesTable } from './currencies-table';
import { CurrencyDialog } from './currency-dialog';

export const dynamic = 'force-dynamic';

export default async function CurrenciesAdminPage() {
  await requireRole(['ADMIN']);
  const currencies = await fetchCurrencies();

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={Globe}
          badge="Admin"
          title="Currencies"
          description="ISO 4217 currencies used across payments, service prices, and placements. Deactivating a currency hides it from dropdowns but preserves historical records."
          action={
            <CurrencyDialog
              trigger={
                <Button size="sm">
                  <Plus className="mr-1.5 size-4" /> Add currency
                </Button>
              }
            />
          }
        />
      </FadeUp>
      <FadeUp delay={0.05}>
        <CurrenciesTable currencies={currencies} />
      </FadeUp>
    </div>
  );
}

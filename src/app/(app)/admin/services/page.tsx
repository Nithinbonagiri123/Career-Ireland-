import { Package } from 'lucide-react';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { requireRole } from '@/lib/auth/session';
import { fetchCurrencies } from '@/modules/currencies/service';
import { fetchServiceCatalog, fetchServicePackages } from '@/modules/services-catalog/service';
import { ServicesView } from './services-view';

export const dynamic = 'force-dynamic';

export default async function ServicesAdminPage() {
  await requireRole(['ADMIN']);
  const [services, packages, currencies] = await Promise.all([
    fetchServiceCatalog(),
    fetchServicePackages(),
    fetchCurrencies(),
  ]);

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={Package}
          badge="Admin"
          title="Services & packages"
          description="Configurable service catalogue (Job Search, Employment Permit, Visa…) and pricing packages that reference them."
        />
      </FadeUp>
      <FadeUp delay={0.05}>
        <ServicesView services={services} packages={packages} currencies={currencies} />
      </FadeUp>
    </div>
  );
}

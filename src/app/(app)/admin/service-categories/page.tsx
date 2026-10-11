import { Tag } from 'lucide-react';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { requirePermission } from '@/lib/auth/session';
import { fetchServiceCategories } from '@/modules/services-catalog/service';
import { CategoriesView } from './categories-view';

export const dynamic = 'force-dynamic';

/**
 * Session 34 — admin surface for the user-editable business-line tags
 * attached to services. Owners/admins add rows here (Candidate services,
 * Recruitment, Immigration, …) so services on `/admin/services` can be
 * organised without a schema change. Adding a new business line later
 * (e.g. "Payroll") is a one-row insert on this page.
 */
export default async function ServiceCategoriesPage() {
  await requirePermission('main', 'admin', 'view');
  const categories = await fetchServiceCategories();

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={Tag}
          badge="Admin"
          title="Service categories"
          description="User-editable business-line tags used to group services. Add new rows here when you launch a new line (Payroll, Legal, …) — services on /admin/services will immediately be able to reference them."
        />
      </FadeUp>
      <FadeUp delay={0.05}>
        <CategoriesView categories={categories} />
      </FadeUp>
    </div>
  );
}

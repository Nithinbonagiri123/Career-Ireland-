import { Stamp } from 'lucide-react';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { requirePermission } from '@/lib/auth/session';
import { fetchApplicationTypes } from '@/modules/immigration/application-types';
import { ApplicationTypesTable } from './application-types-table';

export const dynamic = 'force-dynamic';

export default async function ImmigrationApplicationTypesAdminPage() {
  await requirePermission('main', 'admin', 'view');
  const types = await fetchApplicationTypes();

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={Stamp}
          badge="Admin"
          title="Immigration application types"
          description="Reusable catalog of specific application types staff pick on a new case (e.g. Critical Skills Work Permit, General Employment Permit, Stamp 4). Grouped by top-level category so reporting still buckets everything correctly."
        />
      </FadeUp>
      <FadeUp delay={0.05}>
        <ApplicationTypesTable types={types} />
      </FadeUp>
    </div>
  );
}

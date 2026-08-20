import { Tags } from 'lucide-react';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { requireRole } from '@/lib/auth/session';
import { fetchCategories, fetchOccupations } from '@/modules/occupations/service';
import { OccupationsView } from './occupations-view';

export const dynamic = 'force-dynamic';

export default async function OccupationsAdminPage() {
  await requireRole(['ADMIN']);
  const [categories, occupations] = await Promise.all([fetchCategories(), fetchOccupations()]);

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={Tags}
          badge="Admin"
          title="Occupations"
          description="Occupation taxonomy used to categorise candidates, define document requirements, and match against job requisitions."
        />
      </FadeUp>
      <FadeUp delay={0.05}>
        <OccupationsView categories={categories} occupations={occupations} />
      </FadeUp>
    </div>
  );
}

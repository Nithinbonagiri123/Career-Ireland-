import { GraduationCap } from 'lucide-react';
import { SimpleRefTable } from '@/components/admin/simple-ref-table';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { requireRole } from '@/lib/auth/session';
import {
  setQualificationActiveAction,
  upsertQualificationAction,
} from '@/modules/qualifications/actions';
import { fetchQualifications } from '@/modules/qualifications/service';

export const dynamic = 'force-dynamic';

export default async function QualificationsAdminPage() {
  await requireRole(['ADMIN']);
  const qualifications = await fetchQualifications();

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={GraduationCap}
          badge="Admin"
          title="Qualifications"
          description="Controlled qualification list attached to candidate profiles (e.g. HGV Class 1, City & Guilds Level 3 Plumbing)."
        />
      </FadeUp>
      <FadeUp delay={0.05}>
        <SimpleRefTable
          data={qualifications}
          entityLabel="Qualification"
          emptyTitle="No qualifications yet"
          emptyDescription="Add qualifications commonly requested by Irish employers."
          upsertAction={upsertQualificationAction}
          setActiveAction={setQualificationActiveAction}
        />
      </FadeUp>
    </div>
  );
}

import { Sparkles } from 'lucide-react';
import { SimpleRefTable } from '@/components/admin/simple-ref-table';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { requireRole } from '@/lib/auth/session';
import { setSkillActiveAction, upsertSkillAction } from '@/modules/skills/actions';
import { fetchSkills } from '@/modules/skills/service';

export const dynamic = 'force-dynamic';

export default async function SkillsAdminPage() {
  await requireRole(['ADMIN']);
  const skills = await fetchSkills();

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={Sparkles}
          badge="Admin"
          title="Skills"
          description="Controlled skill vocabulary attached to candidate profiles and used during matching."
        />
      </FadeUp>
      <FadeUp delay={0.05}>
        <SimpleRefTable
          data={skills}
          entityLabel="Skill"
          emptyTitle="No skills yet"
          emptyDescription="Add the skills relevant to Career Ireland's placements (e.g. Forklift Certified, MIG Welding)."
          upsertAction={upsertSkillAction}
          setActiveAction={setSkillActiveAction}
        />
      </FadeUp>
    </div>
  );
}

import { GitMerge, UsersRound } from 'lucide-react';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireRole } from '@/lib/auth/session';
import { fetchMergedPersons, fetchPersons } from '@/modules/persons/service';
import { MergePersonsDialog } from './merge-dialog';
import { ActivePersonsTable, MergedPersonsTable } from './persons-tables';

export const dynamic = 'force-dynamic';

export default async function PersonsAdminPage() {
  await requireRole(['ADMIN']);
  const [active, merged] = await Promise.all([fetchPersons(), fetchMergedPersons()]);

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={UsersRound}
          badge="Admin"
          title="Persons"
          description="The identity root for every human in the system. Duplicates get detected at creation time; use this page to merge any that slipped through."
          action={<MergePersonsDialog persons={active} />}
        />
      </FadeUp>

      <FadeUp delay={0.05} className="mb-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Active persons ({active.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ActivePersonsTable persons={active} />
          </CardContent>
        </Card>
      </FadeUp>

      <FadeUp delay={0.1}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base inline-flex items-center gap-2">
              <GitMerge className="size-4" /> Merged persons ({merged.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <MergedPersonsTable persons={merged} />
          </CardContent>
        </Card>
      </FadeUp>
    </div>
  );
}

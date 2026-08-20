import { asc } from 'drizzle-orm';
import { Plus, ScrollText } from 'lucide-react';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { occupations } from '@/lib/db/schema/occupations';
import { fetchDocumentTypes } from '@/modules/document-types/service';
import { fetchRequirementRules } from '@/modules/documents/service';
import { fetchServicePackages } from '@/modules/services-catalog/service';
import { RuleDialog } from './rule-dialog';
import { RulesTable } from './rules-table';

export const dynamic = 'force-dynamic';

export default async function DocumentRulesPage() {
  await requireRole(['ADMIN']);
  const [rules, docTypes, occs, packages] = await Promise.all([
    fetchRequirementRules(),
    fetchDocumentTypes(),
    db.select().from(occupations).orderBy(asc(occupations.name)),
    fetchServicePackages(),
  ]);

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={ScrollText}
          badge="Admin"
          title="Document requirement rules"
          description="Configure which documents each candidate must supply, based on occupation, service package, or globally."
          action={
            <RuleDialog
              documentTypes={docTypes}
              occupations={occs}
              packages={packages}
              trigger={
                <Button size="sm" disabled={docTypes.length === 0}>
                  <Plus className="mr-1.5 size-4" /> New rule
                </Button>
              }
            />
          }
        />
      </FadeUp>
      <FadeUp delay={0.05}>
        <RulesTable rules={rules} />
      </FadeUp>
    </div>
  );
}

import { Building2, Plus } from 'lucide-react';
import { CsvExportButton } from '@/components/csv-export-button';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { requireRole } from '@/lib/auth/session';
import { fetchEmployers } from '@/modules/employers/service';
import { EmployerDialog } from './employer-dialog';
import { EmployersTable } from './employers-table';

export const dynamic = 'force-dynamic';

export default async function EmployersPage() {
  await requireRole(['ADMIN', 'STAFF']);
  const employers = await fetchEmployers();

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={Building2}
          title="Employers"
          description="Irish employers Career Ireland recruits for. Each employer has multiple contacts and can raise multiple Job Requisitions."
          action={
            <div className="flex gap-2">
              <CsvExportButton href="/api/export/employers" />
              <EmployerDialog
                trigger={
                  <Button size="sm">
                    <Plus className="mr-1.5 size-4" /> New employer
                  </Button>
                }
              />
            </div>
          }
        />
      </FadeUp>
      <FadeUp delay={0.05}>
        <EmployersTable employers={employers} />
      </FadeUp>
    </div>
  );
}

import { asc } from 'drizzle-orm';
import { Briefcase, Plus } from 'lucide-react';
import { CsvExportButton } from '@/components/csv-export-button';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { occupations } from '@/lib/db/schema/occupations';
import { fetchCurrencies } from '@/modules/currencies/service';
import { fetchEmployers } from '@/modules/employers/service';
import { fetchRequisitions } from '@/modules/requisitions/service';
import { RequisitionDialog } from './requisition-dialog';
import { RequisitionsTable } from './requisitions-table';

export const dynamic = 'force-dynamic';

export default async function RequisitionsPage() {
  await requireRole(['ADMIN', 'STAFF']);
  const [requisitions, employers, currencies, occupationList] = await Promise.all([
    fetchRequisitions(),
    fetchEmployers(),
    fetchCurrencies(),
    db.select().from(occupations).orderBy(asc(occupations.name)),
  ]);

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={Briefcase}
          title="Job requisitions"
          description="Employer staffing needs. Each requisition has its own lifecycle, matches, applications, and placements."
          action={
            <div className="flex gap-2">
              <CsvExportButton href="/api/export/requisitions" />
              <RequisitionDialog
                employers={employers}
                currencies={currencies}
                occupations={occupationList}
                trigger={
                  <Button size="sm" disabled={employers.length === 0}>
                    <Plus className="mr-1.5 size-4" /> New requisition
                  </Button>
                }
              />
            </div>
          }
        />
      </FadeUp>
      <FadeUp delay={0.05}>
        <RequisitionsTable requisitions={requisitions} />
      </FadeUp>
    </div>
  );
}

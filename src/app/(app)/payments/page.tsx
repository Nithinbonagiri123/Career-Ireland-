import { Coins } from 'lucide-react';
import { CsvExportButton } from '@/components/csv-export-button';
import { DateRangeFilter } from '@/components/date-range-filter';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { requireAnyPermission } from '@/lib/auth/session';
import { parseDateRangeParams } from '@/lib/date-range';
import { fetchEngagements, fetchPayments } from '@/modules/commerce/service';
import { PaymentsTable } from './payments-table';
import { RecordPaymentDialog } from './record-payment-dialog';

export const dynamic = 'force-dynamic';

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; from?: string; to?: string }>;
}) {
  // Payments is dual-workspace: candidate_services.payments AND
  // main.accounts both lead here. Either grant lets you in.
  const session = await requireAnyPermission([
    { business: 'candidate_services', module: 'payments', verb: 'view' },
    { business: 'main', module: 'accounts', verb: 'view' },
  ]);
  const { created, from, to } = await searchParams;
  const createdRange = parseDateRangeParams({ created, from, to });
  const [payments, engagements] = await Promise.all([
    fetchPayments(createdRange),
    fetchEngagements(),
  ]);

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={Coins}
          title="Payments"
          description="Record incoming payments and verify proof. Only ADMIN can verify or reject."
          action={
            <div className="flex flex-wrap items-center gap-2">
              <DateRangeFilter />
              <CsvExportButton href="/api/export/payments" />
              <RecordPaymentDialog engagements={engagements} />
            </div>
          }
        />
      </FadeUp>
      <FadeUp delay={0.05}>
        <PaymentsTable payments={payments} role={session.user.role} />
      </FadeUp>
    </div>
  );
}

import { Coins } from 'lucide-react';
import { CsvExportButton } from '@/components/csv-export-button';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { requireInternalStaff } from '@/lib/auth/session';
import { fetchEngagements, fetchPayments } from '@/modules/commerce/service';
import { PaymentsTable } from './payments-table';
import { RecordPaymentDialog } from './record-payment-dialog';

export const dynamic = 'force-dynamic';

export default async function PaymentsPage() {
  const session = await requireInternalStaff();
  const [payments, engagements] = await Promise.all([fetchPayments(), fetchEngagements()]);

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={Coins}
          title="Payments"
          description="Record incoming payments and verify proof. Only ADMIN can verify or reject."
          action={
            <div className="flex gap-2">
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

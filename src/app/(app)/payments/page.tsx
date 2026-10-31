import { Wallet } from 'lucide-react';
import { CsvExportButton } from '@/components/csv-export-button';
import { DateRangeFilter } from '@/components/date-range-filter';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { requireFinanceRead } from '@/lib/auth/finance-read';
import { parseDateRangeParams } from '@/lib/date-range';
import { fetchEngagements, fetchPaymentsWorkspace } from '@/modules/commerce/service';
import { PaymentsWorkspaceView } from './payments-workspace';
import { RecordPaymentDialog } from './record-payment-dialog';

export const dynamic = 'force-dynamic';

/**
 * Stage 6G — Payments (approved mockup 07): page header with export, the
 * created-date range, then the workspace (tiles, URL-driven filters,
 * Transactions table/cards with pagination, and the right rail).
 */
export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; from?: string; to?: string }>;
}) {
  // Payments is dual-workspace: candidate_services.payments AND
  // main.accounts both lead here. Either grant lets you in — the same
  // policy guards the payments and revenue CSV exports.
  const session = await requireFinanceRead();
  const { created, from, to } = await searchParams;
  // Default the Payments view to the current calendar month when the
  // URL has no filter — finance workflow is calendar-month shaped. The
  // date control shows that default as "This month"; choosing "Anytime"
  // writes `created=all`, which parses to no restriction.
  const effectiveCreated = created ?? (from || to ? undefined : 'month');
  const createdRange = parseDateRangeParams({ created: effectiveCreated, from, to });
  const [data, engagements] = await Promise.all([
    fetchPaymentsWorkspace(createdRange),
    fetchEngagements(),
  ]);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={Wallet}
          iconTone="blue"
          title="Payments"
          description="Track payments, manage invoices and receipts, and monitor financial activity for your candidates and services."
          action={<CsvExportButton href="/api/export/payments" />}
        />
      </FadeUp>
      <FadeUp delay={0.03}>
        <div className="mb-4 flex min-w-0 max-w-full flex-wrap items-center gap-2">
          <DateRangeFilter className="min-w-0 max-w-full" defaultPreset="month" />
        </div>
      </FadeUp>
      <FadeUp delay={0.05}>
        <PaymentsWorkspaceView
          data={data}
          role={session.user.role}
          recordPaymentSlot={<RecordPaymentDialog key="record-payment" engagements={engagements} />}
        />
      </FadeUp>
    </div>
  );
}

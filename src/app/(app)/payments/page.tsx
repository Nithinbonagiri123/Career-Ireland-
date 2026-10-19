import { Wallet } from 'lucide-react';
import { CsvExportButton } from '@/components/csv-export-button';
import { DateRangeFilter } from '@/components/date-range-filter';
import { FadeUp } from '@/components/motion/motion-primitives';
import { requireAnyPermission } from '@/lib/auth/session';
import { parseDateRangeParams } from '@/lib/date-range';
import { fetchEngagements, fetchPaymentsWorkspace } from '@/modules/commerce/service';
import { PaymentsWorkspaceView } from './payments-workspace';
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
  // Default the Payments view to the current calendar month when the
  // URL has no filter — finance workflow is calendar-month shaped, so
  // "Anytime" was the wrong default here even though it's correct for
  // other list pages (Candidates, Leads, etc.).
  const effectiveCreated = created ?? (from || to ? undefined : 'month');
  const createdRange = parseDateRangeParams({ created: effectiveCreated, from, to });
  const [data, engagements] = await Promise.all([
    fetchPaymentsWorkspace(createdRange),
    fetchEngagements(),
  ]);

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8 md:px-10">
      {/* Stage 6G Screen 07 — hero: icon card + title + subtitle on the
          left, the range filter + export on the right. */}
      <FadeUp>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <span
              aria-hidden
              className="grid size-14 shrink-0 place-items-center rounded-2xl bg-card text-sky-700 shadow-sm ring-1 ring-border/60"
            >
              <Wallet className="size-6" />
            </span>
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                Payments
              </h1>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                Track payments, manage invoices and receipts, and monitor financial activity for
                your candidates and services.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <DateRangeFilter />
            <CsvExportButton href="/api/export/payments" />
          </div>
        </div>
      </FadeUp>
      <FadeUp delay={0.05} className="mt-6">
        <PaymentsWorkspaceView
          data={data}
          role={session.user.role}
          recordPaymentSlot={<RecordPaymentDialog key="record-payment" engagements={engagements} />}
        />
      </FadeUp>
    </div>
  );
}

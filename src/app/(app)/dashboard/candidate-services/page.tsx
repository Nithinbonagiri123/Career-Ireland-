import { Coins, LayoutDashboard, UserPlus, Users } from 'lucide-react';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { requireInternalStaff } from '@/lib/auth/session';
import { fetchDashboardMetrics } from '@/modules/dashboard/service';
import { StatChip } from '../stat-chip';

export const dynamic = 'force-dynamic';

export default async function CandidateServicesDashboard() {
  await requireInternalStaff();
  const m = await fetchDashboardMetrics();

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={LayoutDashboard}
          badge="Candidate Services"
          title="Candidate services — today"
          description="Focused view of lead intake, candidate pool health, and payment verification."
          breadcrumbs={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Candidate services' },
          ]}
        />
      </FadeUp>
      <FadeUp delay={0.05}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          <StatChip
            label="Total candidates"
            value={m.candidates.total}
            hint={`${m.candidates.available} available · ${m.candidates.placed} placed`}
            href="/candidates"
            icon={Users}
          />
          <StatChip
            label="Available now"
            value={m.candidates.available}
            hint="Searchable for new requisitions"
            href="/candidates"
            icon={Users}
          />
          <StatChip
            label="Placed"
            value={m.candidates.placed}
            hint={`${m.candidates.inactive} inactive / archived`}
            href="/candidates"
            icon={Users}
          />
          <StatChip
            label="New leads (7d)"
            value={m.leads.lastSevenDays}
            hint={`${m.leads.total} open · ${m.leads.awaitingPayment} awaiting payment`}
            href="/leads"
            icon={UserPlus}
          />
          <StatChip
            label="Payments to verify"
            value={m.payments.awaitingVerification}
            hint={`${m.payments.verifiedLast30Days} verified last 30d`}
            href="/payments"
            icon={Coins}
            tone="warning"
          />
        </div>
      </FadeUp>
    </div>
  );
}

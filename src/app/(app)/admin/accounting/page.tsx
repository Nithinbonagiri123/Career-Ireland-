import {
  ArrowRight,
  BookOpen,
  CalendarRange,
  FileClock,
  Landmark,
  ListTree,
  Percent,
  Plus,
  Scale,
  TrendingUp,
} from 'lucide-react';
import Link from 'next/link';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requirePermission } from '@/lib/auth/session';
import {
  fetchBusinessDivisions,
  fetchChartOfAccounts,
  fetchFinancialEvents,
  fetchJournals,
} from '@/modules/accounting/read';

export const dynamic = 'force-dynamic';

export default async function AccountingHubPage() {
  await requirePermission('main', 'accounting', 'view');

  const [accounts, divisions, journals, events] = await Promise.all([
    fetchChartOfAccounts(),
    fetchBusinessDivisions(),
    fetchJournals(5),
    fetchFinancialEvents(5),
  ]);

  const postedJournals = journals.filter((j) => j.status === 'POSTED').length;
  const pendingEvents = events.filter(
    (e) => e.status === 'RECEIVED' || e.status === 'PROCESSING',
  ).length;
  const failedEvents = events.filter((e) => e.status === 'FAILED').length;

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 md:px-10 md:py-10">
      <FadeUp>
        <PageHeader
          icon={BookOpen}
          badge="Accounting · Phase 1"
          title="Double-entry ledger"
          description="Chart of accounts, journals, and financial events. The ledger shadow-records every finance event the operational system emits; nothing in the invoice / payment UI changes."
          breadcrumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Accounting' }]}
        />
      </FadeUp>

      <FadeUp delay={0.05} className="mt-6 mb-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Chart accounts"
            value={accounts.length.toString()}
            hint={`${divisions.length} divisions`}
          />
          <StatCard
            label="Posted journals"
            value={postedJournals.toString()}
            hint={`${journals.length} shown`}
          />
          <StatCard
            label="Events in queue"
            value={pendingEvents.toString()}
            hint="RECEIVED or PROCESSING"
            tone={pendingEvents > 0 ? 'warning' : 'default'}
          />
          <StatCard
            label="Failed events"
            value={failedEvents.toString()}
            hint="needs manual review"
            tone={failedEvents > 0 ? 'danger' : 'default'}
          />
        </div>
      </FadeUp>

      <FadeUp delay={0.1}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <HubLink
            href="/admin/accounting/accounts"
            icon={ListTree}
            title="Chart of accounts"
            description="Browse the chart; see which accounts allow posting."
            count={`${accounts.length} accounts`}
          />
          <HubLink
            href="/admin/accounting/journals"
            icon={Landmark}
            title="Journals"
            description="Every balanced posting with drill-down to its lines."
            count={`${journals.length} recent`}
          />
          <HubLink
            href="/admin/accounting/journals?post=1"
            icon={Plus}
            title="Post manual journal"
            description="Admin + Finance only. Debits must equal credits — enforced by DB trigger."
          />
          <HubLink
            href="/admin/accounting/events"
            icon={FileClock}
            title="Financial events"
            description="Outbox of events the operational system has emitted. Phase 2 wires these to journal postings."
            count={`${events.length} recent`}
          />
          <HubLink
            href="/admin/accounting/trial-balance"
            icon={Scale}
            title="Trial balance"
            description="Internal consistency check — every POSTED journal line aggregated by account. Debits must equal credits."
          />
          <HubLink
            href="/admin/accounting/profit-loss"
            icon={TrendingUp}
            title="Profit &amp; loss"
            description="Revenue, cost of sales, operating expenses and net profit for a period. Reads straight from the ledger."
          />
          <HubLink
            href="/admin/accounting/periods"
            icon={CalendarRange}
            title="Periods"
            description="Month-end lifecycle: OPEN → SOFT_CLOSED → CLOSED → LOCKED. Close is blocked if DRAFT journals remain or the period doesn't balance."
          />
          <HubLink
            href="/admin/accounting/vat"
            icon={Percent}
            title="VAT return"
            description="Irish VAT3 T1 / T2 / T3 totals for a period, with CSV export of every underlying transaction for Revenue filing."
          />
        </div>
      </FadeUp>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'warning' | 'danger';
}) {
  const toneClass =
    tone === 'danger'
      ? 'text-destructive'
      : tone === 'warning'
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-foreground';
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className={`mt-1 text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
        {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function HubLink({
  href,
  icon: Icon,
  title,
  description,
  count,
}: {
  href: string;
  icon: typeof BookOpen;
  title: string;
  description: string;
  count?: string;
}) {
  return (
    <Card className="transition-colors hover:border-foreground/20">
      <CardHeader className="flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-md bg-muted/60">
            <Icon className="size-4" />
          </span>
          <CardTitle className="text-base">{title}</CardTitle>
        </div>
        {count && (
          <Badge variant="secondary" className="rounded-full text-[10px]">
            {count}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{description}</p>
        <Link
          href={href}
          className={`${buttonVariants({ variant: 'ghost', size: 'sm' })} shrink-0`}
          aria-label={`Open ${title}`}
        >
          Open <ArrowRight className="ml-1.5 size-3.5" />
        </Link>
      </CardContent>
    </Card>
  );
}

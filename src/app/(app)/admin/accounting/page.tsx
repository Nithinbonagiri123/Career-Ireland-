import {
  AlertTriangle,
  BookOpen,
  CalendarCheck,
  CalendarRange,
  FileClock,
  Hourglass,
  Landmark,
  Library,
  ListTree,
  Percent,
  Plus,
  Scale,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { StatTile, StatTileGrid } from '@/components/ds/stat-tile';
import { FadeUp } from '@/components/motion/motion-primitives';
import { PageHeader } from '@/components/page-header';
import { requirePermission } from '@/lib/auth/session';
import {
  fetchBusinessDivisions,
  fetchChartOfAccounts,
  fetchFinancialEvents,
  fetchJournals,
} from '@/modules/accounting/read';
import { ACC_PAGE, HubCard } from './accounting-ui';

export const dynamic = 'force-dynamic';

/** Same window the Financial events page lists. */
const EVENT_WINDOW = 200;
/** Same window the Journals page lists. */
const JOURNAL_WINDOW = 100;

export default async function AccountingHubPage() {
  await requirePermission('main', 'accounting', 'view');

  const [accounts, divisions, journals, events] = await Promise.all([
    fetchChartOfAccounts(),
    fetchBusinessDivisions(),
    fetchJournals(JOURNAL_WINDOW),
    fetchFinancialEvents(EVENT_WINDOW),
  ]);

  // Counts are exact unless a list hit its window; then the hint says so
  // (the hub used to count only the latest 5 rows without saying so).
  const journalsCapped = journals.length >= JOURNAL_WINDOW;
  const postedJournals = journals.filter((j) => j.status === 'POSTED').length;
  const journalHint = journalsCapped
    ? `In the latest ${JOURNAL_WINDOW} journals`
    : `Of ${journals.length} journal${journals.length === 1 ? '' : 's'}`;
  const eventsCapped = events.length >= EVENT_WINDOW;
  // Event counts are exact unless the list hit its window.
  const eventScope = eventsCapped ? ` · latest ${EVENT_WINDOW} events` : '';
  const pendingEvents = events.filter(
    (e) => e.status === 'RECEIVED' || e.status === 'PROCESSING',
  ).length;
  const failedEvents = events.filter((e) => e.status === 'FAILED').length;

  return (
    <div className={ACC_PAGE}>
      <FadeUp>
        <PageHeader
          icon={BookOpen}
          iconTone="blue"
          title="Double-entry ledger"
          description="Chart of accounts, journals, reports and accounts payable. Every invoice, payment, credit note and bill is recorded in the ledger as a balanced journal."
          breadcrumbs={[{ label: 'Admin', href: '/admin' }, { label: 'Accounting' }]}
        />
      </FadeUp>

      <FadeUp delay={0.05} className="mb-6">
        <StatTileGrid>
          <StatTile
            icon={ListTree}
            label="Chart accounts"
            value={accounts.length}
            hint={`${divisions.length} division${divisions.length === 1 ? '' : 's'}`}
          />
          <StatTile
            icon={Landmark}
            tone="green"
            label="Posted journals"
            value={postedJournals}
            hint={journalHint}
          />
          <StatTile
            icon={Hourglass}
            tone={pendingEvents > 0 ? 'amber' : 'slate'}
            label="Events in queue"
            value={pendingEvents}
            hint={`Received or processing${eventScope}`}
          />
          <StatTile
            icon={AlertTriangle}
            tone={failedEvents > 0 ? 'rose' : 'slate'}
            label="Failed events"
            value={failedEvents}
            hint={`Need manual review${eventScope}`}
          />
        </StatTileGrid>
      </FadeUp>

      <FadeUp delay={0.1}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <HubCard
            href="/admin/accounting/accounts"
            icon={ListTree}
            title="Chart of accounts"
            description="Browse the chart and see which accounts accept postings."
            count={`${accounts.length} accounts`}
          />
          <HubCard
            href="/admin/accounting/journals"
            icon={Landmark}
            title="Journals"
            description="Every balanced posting, with its lines."
            count={`${journals.length}${journalsCapped ? '+' : ''} journal${journals.length === 1 ? '' : 's'}`}
          />
          <HubCard
            href="/admin/accounting/journals?post=1"
            icon={Plus}
            tone="green"
            title="Post manual journal"
            description="Admin and Finance only. Debits must equal credits, or nothing is saved."
          />
          <HubCard
            href="/admin/accounting/events"
            icon={FileClock}
            tone="violet"
            title="Financial events"
            description="Events from invoices, payments, credit notes and bills, and the journal each one produced."
            count={`${events.length}${eventsCapped ? '+' : ''} event${events.length === 1 ? '' : 's'}`}
          />
          <HubCard
            href="/admin/accounting/trial-balance"
            icon={Scale}
            tone="teal"
            title="Trial balance"
            description="Every posted journal line totalled by account. Debits must equal credits."
          />
          <HubCard
            href="/admin/accounting/profit-loss"
            icon={TrendingUp}
            tone="teal"
            title="Profit & loss"
            description="Revenue, cost of sales, operating expenses and net profit for a period."
          />
          <HubCard
            href="/admin/accounting/balance-sheet"
            icon={Library}
            tone="teal"
            title="Balance sheet"
            description="Assets, liabilities and equity on a date, including this year's profit to date."
          />
          <HubCard
            href="/admin/accounting/periods"
            icon={CalendarRange}
            tone="amber"
            title="Periods"
            description="Month-end: Open → Soft closed → Closed → Locked. A period can't close while draft journals remain or it doesn't balance."
          />
          <HubCard
            href="/admin/accounting/vat"
            icon={Percent}
            tone="violet"
            title="VAT return"
            description="Irish VAT3 T1–T4 totals for a period, with a CSV of every transaction behind them."
          />
          <HubCard
            href="/admin/accounting/ap"
            icon={Wallet}
            tone="rose"
            title="Accounts Payable"
            description="Suppliers, bills, bill payments and AP aging."
          />
          <HubCard
            href="/admin/accounting/year-end"
            icon={CalendarCheck}
            tone="amber"
            title="Year-end close"
            description="Move the year's profit and loss into Retained Earnings. Admin only, once per financial year."
          />
        </div>
      </FadeUp>
    </div>
  );
}

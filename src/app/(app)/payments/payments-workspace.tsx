'use client';

import { format } from 'date-fns';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Clock,
  CreditCard,
  FileText,
  Info,
  LayoutGrid,
  MoreHorizontal,
  Receipt,
  Table2,
  Wallet,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { initialsOf } from '@/components/ds/entity-card';
import { FilterToolbar } from '@/components/ds/list-controls';
import { Pagination, paginate } from '@/components/ds/pagination';
import { SEG_TRAY, segItem } from '@/components/ds/segmented';
import { StatTile, StatTileGrid } from '@/components/ds/stat-tile';
import { DsStatusPill } from '@/components/ds/status-pill';
import { DS_SOFT, type DsTone } from '@/components/ds/tones';
import { ActivityTimeline, SectionCard } from '@/components/ds/workspace';
import { PromptDialog } from '@/components/prompt-dialog';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatCurrency } from '@/lib/currency';
import type { UserRole } from '@/lib/db/schema/users';
import { cn } from '@/lib/utils';
import { rejectPaymentAction, verifyPaymentAction } from '@/modules/commerce/actions';
import type { PaymentsTransactionRow, PaymentsWorkspace } from '@/modules/commerce/service';

/**
 * Stage 6G Screen 07 — the Payments page body below the header: KPI tiles,
 * the Transactions surface (table / cards, same filtered rows in both, with
 * verify + reject preserved), and the right rail with quick actions,
 * recent activity and the payment-workflow note.
 *
 * Search (`q`), status (`status`), view (`view=cards`), page and per-page
 * live in the URL so a filtered view is bookmarkable and survives
 * navigation. The created-date range stays on DateRangeFilter's params.
 */

const PER_OPTIONS = [8, 20, 50];

const STATUS_LABEL: Record<PaymentsTransactionRow['status'], string> = {
  PENDING: 'Pending',
  PROOF_UPLOADED: 'Pending',
  VERIFIED: 'Paid',
  REJECTED: 'Rejected',
  REFUNDED: 'Refunded',
  PARTIALLY_REFUNDED: 'Partially refunded',
};

const STATUS_TONE: Record<PaymentsTransactionRow['status'], DsTone> = {
  PENDING: 'blue',
  PROOF_UPLOADED: 'blue',
  VERIFIED: 'green',
  REJECTED: 'rose',
  REFUNDED: 'amber',
  PARTIALLY_REFUNDED: 'amber',
};

const STATUS_FILTERS = [
  { value: '', label: 'All statuses' },
  { value: 'paid', label: 'Paid' },
  { value: 'pending', label: 'Pending' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'refunded', label: 'Refunded' },
];

function StatusPill({ status }: { status: PaymentsTransactionRow['status'] }) {
  return <DsStatusPill tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</DsStatusPill>;
}

function DeltaLine({ pct }: { pct: number | null }) {
  if (pct === null) return <span>vs. prior period: —</span>;
  const up = pct >= 0;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 font-medium',
        up ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300',
      )}
    >
      {up ? (
        <ArrowUp className="size-3" aria-hidden />
      ) : (
        <ArrowDown className="size-3" aria-hidden />
      )}
      {Math.abs(pct)}% vs. prior period
    </span>
  );
}

function amountLines(byCurrency: Record<string, string>): { primary: string; extra: string[] } {
  const entries = Object.entries(byCurrency);
  if (entries.length === 0) return { primary: formatCurrency('0', 'EUR'), extra: [] };
  const [first, ...rest] = entries as [string, string][];
  return {
    primary: formatCurrency(first[1], first[0]),
    extra: rest.map(([c, v]) => formatCurrency(v, c)),
  };
}

/** Tile value sized so five tiles fit one row on a desktop content area. */
function TileValue({ children }: { children: ReactNode }) {
  return <span className="text-xl tabular-nums xl:text-[1.35rem]">{children}</span>;
}

/** Tile hint: other-currency totals (if any) above the comparison line. */
function TileHint({ extra, children }: { extra?: string[]; children: ReactNode }) {
  return (
    <>
      {extra && extra.length > 0 && <span className="block tabular-nums">{extra.join(' · ')}</span>}
      <span className="block">{children}</span>
    </>
  );
}

export function PaymentsWorkspaceView({
  data,
  role,
  recordPaymentSlot,
}: {
  data: PaymentsWorkspace;
  role: UserRole;
  recordPaymentSlot?: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const search = params.get('q') ?? '';
  const status = params.get('status') ?? '';
  const view: 'table' | 'cards' = params.get('view') === 'cards' ? 'cards' : 'table';
  const [busy, setBusy] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<PaymentsTransactionRow | null>(null);
  const [, startTransition] = useTransition();

  const setView = (next: 'table' | 'cards') => {
    const sp = new URLSearchParams(params.toString());
    if (next === 'table') sp.delete('view');
    else sp.set('view', 'cards');
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const verify = (p: PaymentsTransactionRow) => {
    setBusy(p.id);
    startTransition(async () => {
      const r = await verifyPaymentAction({ paymentId: p.id });
      setBusy(null);
      if (r.ok) {
        toast.success('Payment verified — engagement moved to ACTIVE');
        router.refresh();
      } else toast.error(r.error.message);
    });
  };
  const confirmReject = (reason: string) => {
    if (!rejectTarget) return;
    const target = rejectTarget;
    setBusy(target.id);
    startTransition(async () => {
      const r = await rejectPaymentAction({ paymentId: target.id, reason });
      setBusy(null);
      if (r.ok) {
        toast.success('Payment rejected');
        setRejectTarget(null);
        router.refresh();
      } else toast.error(r.error.message);
    });
  };

  // One filtered list feeds both the table and the cards.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.transactions.filter((t) => {
      if (status === 'paid' && t.status !== 'VERIFIED') return false;
      if (status === 'pending' && t.status !== 'PENDING' && t.status !== 'PROOF_UPLOADED')
        return false;
      if (status === 'rejected' && t.status !== 'REJECTED') return false;
      if (status === 'refunded' && t.status !== 'REFUNDED' && t.status !== 'PARTIALLY_REFUNDED')
        return false;
      if (!q) return true;
      return [t.personName, t.serviceName, t.proofReference, t.receiptNumber, t.amount]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [data.transactions, search, status]);
  const pageData = paginate(
    filtered,
    params.get('page') ?? undefined,
    params.get('per') ?? undefined,
    PER_OPTIONS,
  );
  const visible = pageData.items;

  const paid = amountLines(data.summary.receivedByCurrency);
  const pending = amountLines(data.pendingByCurrency);
  const overdue = amountLines(data.summary.overdueByCurrency);

  // Verify / Reject stay ADMIN-only on this screen (unchanged per-screen
  // visibility); the server re-checks finance authority on every action.
  const rowActions = (t: PaymentsTransactionRow) => {
    const canDecide = role === 'ADMIN' && (t.status === 'PENDING' || t.status === 'PROOF_UPLOADED');
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Actions"
              disabled={busy === t.id}
              className="shrink-0"
            />
          }
        >
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {t.personId && (
            <DropdownMenuItem
              render={
                <Link href={`/clients/${t.personId}?tab=services-billing`}>View candidate</Link>
              }
            />
          )}
          {canDecide && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Payment decision</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => verify(t)}>
                <Check className="mr-2 size-4" /> Verify
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setRejectTarget(t)}>
                <X className="mr-2 size-4" /> Reject…
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const reference = (t: PaymentsTransactionRow) => t.receiptNumber ?? t.proofReference;

  const card = (t: PaymentsTransactionRow) => (
    <article
      key={t.id}
      className="flex min-w-0 flex-col gap-3 rounded-xl border border-border/70 bg-card p-3.5"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold',
            DS_SOFT[STATUS_TONE[t.status]],
          )}
        >
          {t.personName ? initialsOf(t.personName) : <CreditCard className="size-4" />}
        </span>
        <div className="min-w-0 flex-1">
          {t.personId ? (
            <Link
              href={`/clients/${t.personId}?tab=services-billing`}
              className="block truncate text-sm font-semibold text-foreground hover:underline"
            >
              {t.personName ?? 'Unknown'}
            </Link>
          ) : (
            <p className="truncate text-sm font-semibold text-foreground">
              {t.personName ?? 'Unknown candidate'}
            </p>
          )}
          <p className="truncate text-xs text-muted-foreground">
            {t.serviceName} · {t.kind}
          </p>
        </div>
        {rowActions(t)}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-base font-semibold tabular-nums">
          {formatCurrency(t.amount, t.currencyCode)}
        </span>
        <StatusPill status={t.status} />
      </div>
      <p className="text-xs tabular-nums text-muted-foreground">
        {format(new Date(t.dateIso), 'dd MMM yyyy · HH:mm')}
        {reference(t) && <> · {reference(t)}</>}
      </p>
    </article>
  );

  return (
    <div className="space-y-5">
      {/* Five tiles, laid out on purpose: phones and tablets lead with
          Total Paid across the full width then a 2×2 grid; laptops show
          2 + 3; wide screens one row of five. */}
      <StatTileGrid className="lg:grid-cols-6 xl:grid-cols-5">
        <StatTile
          className="col-span-2 lg:col-span-3 xl:col-span-1"
          icon={Wallet}
          tone="green"
          label="Total Paid"
          value={<TileValue>{paid.primary}</TileValue>}
          hint={
            <TileHint extra={paid.extra}>
              <DeltaLine pct={data.receiptsDeltaPct} />
            </TileHint>
          }
        />
        <StatTile
          className="lg:col-span-3 xl:col-span-1"
          icon={Clock}
          tone="blue"
          label="Pending"
          value={<TileValue>{pending.primary}</TileValue>}
          hint={
            <TileHint extra={pending.extra}>
              {`${data.pendingCount} payment${data.pendingCount === 1 ? '' : 's'}`}
            </TileHint>
          }
        />
        <StatTile
          className="lg:col-span-2 xl:col-span-1"
          icon={FileText}
          tone="violet"
          label="Invoices Issued"
          value={<TileValue>{data.invoicesIssuedCount}</TileValue>}
          hint={<DeltaLine pct={data.invoicesDeltaPct} />}
        />
        <StatTile
          className="lg:col-span-2 xl:col-span-1"
          icon={Receipt}
          tone="amber"
          label="Receipts Issued"
          value={<TileValue>{data.summary.receivedCount}</TileValue>}
          hint={<DeltaLine pct={data.receiptsDeltaPct} />}
        />
        <StatTile
          className="lg:col-span-2 xl:col-span-1"
          icon={Clock}
          tone="rose"
          label="Overdue"
          value={<TileValue>{overdue.primary}</TileValue>}
          hint={
            <TileHint extra={overdue.extra}>
              {`${data.summary.overdueCount} invoice${data.summary.overdueCount === 1 ? '' : 's'}`}
            </TileHint>
          }
        />
      </StatTileGrid>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0 space-y-5">
          <FilterToolbar
            searchPlaceholder="Search by candidate, service, reference or amount…"
            selects={[{ param: 'status', label: 'Status', options: STATUS_FILTERS }]}
          />

          <SectionCard
            icon={CreditCard}
            title="Transactions"
            count={filtered.length}
            action={
              // Buttons (not links): the toggle swaps the `view` param in place.
              // Hidden on phones, which always show cards.
              <fieldset className={cn(SEG_TRAY, 'm-0 shadow-none max-md:hidden')}>
                <legend className="sr-only">View as</legend>
                <button
                  type="button"
                  onClick={() => setView('table')}
                  aria-pressed={view === 'table'}
                  className={segItem(view === 'table')}
                >
                  <Table2 className="size-3.5" aria-hidden /> Table
                </button>
                <button
                  type="button"
                  onClick={() => setView('cards')}
                  aria-pressed={view === 'cards'}
                  className={segItem(view === 'cards')}
                >
                  <LayoutGrid className="size-3.5" aria-hidden /> Cards
                </button>
              </fieldset>
            }
          >
            {visible.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No payments match the current filters.
              </p>
            ) : (
              <>
                {view === 'table' && (
                  // Phones always get cards; the table needs tablet width.
                  <div className="hidden overflow-x-auto md:block" data-testid="payments-table">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                          <th className="py-2.5 pr-3 font-medium">Date</th>
                          <th className="py-2.5 pr-3 font-medium">Candidate</th>
                          <th className="py-2.5 pr-3 font-medium">Service</th>
                          <th className="py-2.5 pr-3 text-right font-medium">Amount</th>
                          <th className="py-2.5 pr-3 font-medium">Status</th>
                          <th className="py-2.5 pr-3 font-medium">Reference</th>
                          <th className="w-12 py-2.5 text-right font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visible.map((t) => (
                          <tr
                            key={t.id}
                            className="border-b border-border/60 last:border-b-0 hover:bg-muted/40"
                          >
                            <td className="whitespace-nowrap py-3 pr-3 text-xs text-muted-foreground">
                              <time dateTime={t.dateIso} className="tabular-nums">
                                <span className="block text-foreground">
                                  {format(new Date(t.dateIso), 'dd MMM yyyy')}
                                </span>
                                {/* One text node per row keeps the full "date · time" readable
                                    (and matchable) while the time sits on its own line. */}
                                <span> · {format(new Date(t.dateIso), 'HH:mm')}</span>
                              </time>
                            </td>
                            <td className="max-w-[12rem] py-3 pr-3">
                              {t.personId ? (
                                <Link
                                  href={`/clients/${t.personId}?tab=services-billing`}
                                  className="line-clamp-2 font-medium text-foreground underline-offset-2 hover:underline"
                                >
                                  {t.personName ?? 'Unknown'}
                                </Link>
                              ) : (
                                <span className="text-muted-foreground">Unknown candidate</span>
                              )}
                            </td>
                            <td className="py-3 pr-3">
                              <span className="block text-foreground">{t.serviceName}</span>
                              <span className="block text-xs text-muted-foreground">{t.kind}</span>
                            </td>
                            <td className="whitespace-nowrap py-3 pr-3 text-right font-medium tabular-nums text-foreground">
                              {formatCurrency(t.amount, t.currencyCode)}
                            </td>
                            <td className="py-3 pr-3">
                              <StatusPill status={t.status} />
                            </td>
                            <td className="py-3 pr-3 text-xs text-muted-foreground [overflow-wrap:anywhere]">
                              {reference(t) ?? '—'}
                            </td>
                            <td className="py-3 text-right">{rowActions(t)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div
                  className={cn(
                    'grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-3',
                    view === 'table' && 'md:hidden',
                  )}
                  data-testid="payments-cards"
                >
                  {visible.map(card)}
                </div>
              </>
            )}

            <Pagination
              basePath={pathname}
              params={Object.fromEntries(params.entries())}
              page={pageData.page}
              pages={pageData.pages}
              per={pageData.per}
              total={pageData.total}
              start={pageData.start}
              noun="transactions"
              perOptions={PER_OPTIONS}
            />
          </SectionCard>
        </div>

        {/* ── Right rail ──────────────────────────────────────────── */}
        <div className="space-y-5">
          <section
            aria-label="Quick actions"
            className="space-y-2 rounded-2xl border border-border/60 bg-card p-4 shadow-sm"
          >
            <Link href="/leads" className={cn(buttonVariants(), 'w-full justify-center')}>
              <FileText className="mr-1.5 size-4" aria-hidden />
              Create Pro Forma
            </Link>
            <Link
              href="/leads"
              className={cn(buttonVariants({ variant: 'outline' }), 'w-full justify-center')}
            >
              <CreditCard className="mr-1.5 size-4" aria-hidden />
              Direct Payment &amp; Convert
            </Link>
            <Link
              href="/admin/accounting"
              className={cn(buttonVariants({ variant: 'outline' }), 'w-full justify-center')}
            >
              <Receipt className="mr-1.5 size-4" aria-hidden />
              View Invoices
            </Link>
            {recordPaymentSlot}
          </section>

          <SectionCard icon={Clock} title="Recent Activity">
            {data.activity.length === 0 ? (
              <p className="text-sm text-muted-foreground">No billing activity yet.</p>
            ) : (
              <ActivityTimeline
                items={data.activity.map((a) => ({
                  id: a.id,
                  title: a.title,
                  subtitle: a.subtitle,
                  at: a.atIso,
                }))}
              />
            )}
          </SectionCard>

          <section className="rounded-2xl border border-sky-200 bg-sky-50 p-4 dark:border-sky-500/30 dark:bg-sky-500/10">
            <div className="flex items-start gap-2.5">
              <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <div className="min-w-0 text-xs text-foreground/80">
                <p className="text-sm font-semibold text-foreground">Payment workflow</p>
                <p className="mt-1 leading-relaxed">
                  When a payment covering the full agreed amount is verified, the system
                  automatically issues the official invoice and receipt — and for Direct Payment
                  &amp; Convert, activates the candidate profile in the same step.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>

      <PromptDialog
        open={rejectTarget !== null}
        onCancel={() => setRejectTarget(null)}
        onConfirm={confirmReject}
        title="Reject payment"
        description={
          rejectTarget
            ? `${formatCurrency(rejectTarget.amount, rejectTarget.currencyCode)} for ${rejectTarget.serviceName}.`
            : undefined
        }
        label="Reason (audited)"
        placeholder="e.g. Wrong amount / duplicate transfer / no proof"
        confirmLabel="Reject"
        confirmVariant="destructive"
        pending={busy === rejectTarget?.id}
      />
    </div>
  );
}

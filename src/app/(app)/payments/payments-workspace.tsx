'use client';

import { format } from 'date-fns';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  CreditCard,
  FileText,
  Info,
  LayoutGrid,
  MoreHorizontal,
  Receipt,
  Search,
  Table2,
  Wallet,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactNode, useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { PromptDialog } from '@/components/prompt-dialog';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { formatCurrency } from '@/lib/currency';
import type { UserRole } from '@/lib/db/schema/users';
import { cn } from '@/lib/utils';
import { rejectPaymentAction, verifyPaymentAction } from '@/modules/commerce/actions';
import type { PaymentsTransactionRow, PaymentsWorkspace } from '@/modules/commerce/service';

/**
 * Stage 6G Screen 07 — the Payments page body below the hero: KPI
 * tiles, the filterable Transactions surface (table/cards views with
 * verify + reject preserved from the old table), and the right rail
 * with quick actions, recent activity and the payment-workflow note.
 */

const PAGE_SIZE = 8;

const STATUS_LABEL: Record<PaymentsTransactionRow['status'], string> = {
  PENDING: 'Pending',
  PROOF_UPLOADED: 'Pending',
  VERIFIED: 'Paid',
  REJECTED: 'Rejected',
  REFUNDED: 'Refunded',
  PARTIALLY_REFUNDED: 'Partially refunded',
};

function statusPillClass(status: PaymentsTransactionRow['status']): string {
  switch (status) {
    case 'VERIFIED':
      return 'bg-status-success-soft text-status-success';
    case 'PENDING':
    case 'PROOF_UPLOADED':
      return 'bg-sky-100 text-sky-700';
    case 'REJECTED':
      return 'bg-destructive/10 text-destructive';
    default:
      return 'bg-amber-100 text-amber-800';
  }
}

function KpiTile({
  icon: Icon,
  tone,
  label,
  primary,
  extra,
  sub,
}: {
  icon: typeof Wallet;
  tone: string;
  label: string;
  primary: string;
  extra?: string[];
  sub: ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm ring-1 ring-border/60">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className={cn('grid size-9 shrink-0 place-items-center rounded-lg', tone)}
        >
          <Icon className="size-4" />
        </span>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
      </div>
      <p className="mt-2.5 text-xl font-semibold tabular-nums text-foreground">{primary}</p>
      {extra?.map((line) => (
        <p key={line} className="text-xs tabular-nums text-muted-foreground">
          {line}
        </p>
      ))}
      <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div>
    </div>
  );
}

function DeltaLine({ pct }: { pct: number | null }) {
  if (pct === null) return <span>vs. prior period: —</span>;
  const up = pct >= 0;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 font-medium',
        up ? 'text-status-success' : 'text-destructive',
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
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [view, setView] = useState<'table' | 'cards'>('table');
  const [pageIdx, setPageIdx] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<PaymentsTransactionRow | null>(null);
  const [, startTransition] = useTransition();

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
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(pageIdx, pageCount - 1);
  const visible = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const paid = amountLines(data.summary.receivedByCurrency);
  const pending = amountLines(data.pendingByCurrency);
  const overdue = amountLines(data.summary.overdueByCurrency);

  const rowActions = (t: PaymentsTransactionRow) => {
    const canDecide = role === 'ADMIN' && (t.status === 'PENDING' || t.status === 'PROOF_UPLOADED');
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon" aria-label="Actions" disabled={busy === t.id} />
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

  return (
    <div className="space-y-5">
      {/* ── KPI tiles — full-width row above both columns, like the
          mockup. ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <KpiTile
          icon={Wallet}
          tone="bg-status-success-soft text-status-success"
          label="Total Paid"
          primary={paid.primary}
          extra={paid.extra}
          sub={<DeltaLine pct={data.receiptsDeltaPct} />}
        />
        <KpiTile
          icon={Clock}
          tone="bg-info/10 text-info"
          label="Pending"
          primary={pending.primary}
          extra={pending.extra}
          sub={`${data.pendingCount} payment${data.pendingCount === 1 ? '' : 's'}`}
        />
        <KpiTile
          icon={FileText}
          tone="bg-violet-100 text-violet-700"
          label="Invoices Issued"
          primary={String(data.invoicesIssuedCount)}
          sub={<DeltaLine pct={data.invoicesDeltaPct} />}
        />
        <KpiTile
          icon={Receipt}
          tone="bg-amber-100 text-amber-700"
          label="Receipts Issued"
          primary={String(data.summary.receivedCount)}
          sub={<DeltaLine pct={data.receiptsDeltaPct} />}
        />
        <KpiTile
          icon={Clock}
          tone="bg-destructive/10 text-destructive"
          label="Overdue"
          primary={overdue.primary}
          extra={overdue.extra}
          sub={`${data.summary.overdueCount} invoice${data.summary.overdueCount === 1 ? '' : 's'}`}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-5">
          {/* ── Search + status filter ────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 shadow-sm ring-1 ring-border/60">
            <div className="relative min-w-0 flex-1">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPageIdx(0);
                }}
                placeholder="Search by candidate, service, reference or amount…"
                className="h-9 pl-8 text-xs"
              />
            </div>
            <Select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPageIdx(0);
              }}
              className="h-9 w-36 text-xs"
              aria-label="Status filter"
            >
              <option value="">All statuses</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
              <option value="rejected">Rejected</option>
              <option value="refunded">Refunded</option>
            </Select>
          </div>

          {/* ── Transactions ──────────────────────────────────────── */}
          <section className="rounded-xl border bg-card p-4 shadow-sm ring-1 ring-border/60 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  aria-hidden
                  className="grid size-8 shrink-0 place-items-center rounded-lg bg-sky-100 text-sky-700"
                >
                  <CreditCard className="size-4" />
                </span>
                <h2 className="text-sm font-semibold text-foreground">
                  Transactions{' '}
                  <span className="font-normal text-muted-foreground">({filtered.length})</span>
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex overflow-hidden rounded-lg border">
                  <button
                    type="button"
                    onClick={() => setView('table')}
                    aria-pressed={view === 'table'}
                    className={cn(
                      'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors',
                      view === 'table'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <Table2 className="size-3.5" aria-hidden /> Table
                  </button>
                  <button
                    type="button"
                    onClick={() => setView('cards')}
                    aria-pressed={view === 'cards'}
                    className={cn(
                      'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors',
                      view === 'cards'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <LayoutGrid className="size-3.5" aria-hidden /> Cards
                  </button>
                </div>
              </div>
            </div>

            {visible.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No payments match the current filters.
              </p>
            ) : view === 'table' ? (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[760px] text-xs">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">Date</th>
                      <th className="py-2 pr-3 font-medium">Candidate</th>
                      <th className="py-2 pr-3 font-medium">Service</th>
                      <th className="py-2 pr-3 font-medium">Type</th>
                      <th className="py-2 pr-3 text-right font-medium">Amount</th>
                      <th className="py-2 pr-3 font-medium">Status</th>
                      <th className="py-2 pr-3 font-medium">Reference</th>
                      <th className="py-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((t) => (
                      <tr key={t.id} className="border-b last:border-b-0">
                        <td className="py-2.5 pr-3 text-muted-foreground">
                          <time dateTime={t.dateIso} className="tabular-nums">
                            {format(new Date(t.dateIso), 'dd MMM yyyy')}
                            <span className="block text-[10px]">
                              {format(new Date(t.dateIso), 'HH:mm')}
                            </span>
                          </time>
                        </td>
                        <td className="py-2.5 pr-3">
                          {t.personId ? (
                            <Link
                              href={`/clients/${t.personId}?tab=services-billing`}
                              className="font-medium text-foreground underline-offset-2 hover:underline"
                            >
                              {t.personName ?? 'Unknown'}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-2.5 pr-3 text-foreground">{t.serviceName}</td>
                        <td className="py-2.5 pr-3 text-muted-foreground">{t.kind}</td>
                        <td className="py-2.5 pr-3 text-right font-medium tabular-nums text-foreground">
                          {formatCurrency(t.amount, t.currencyCode)}
                        </td>
                        <td className="py-2.5 pr-3">
                          <Badge
                            variant="secondary"
                            className={cn(
                              'rounded-full border-transparent text-[10px]',
                              statusPillClass(t.status),
                            )}
                          >
                            {STATUS_LABEL[t.status]}
                          </Badge>
                        </td>
                        <td className="py-2.5 pr-3 text-muted-foreground">
                          {t.receiptNumber ?? t.proofReference ?? '—'}
                        </td>
                        <td className="py-2.5">{rowActions(t)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {visible.map((t) => (
                  <div key={t.id} className="rounded-xl border bg-background p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {t.personName ?? '—'}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {t.serviceName} · {t.kind}
                        </p>
                      </div>
                      {rowActions(t)}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-base font-semibold tabular-nums">
                        {formatCurrency(t.amount, t.currencyCode)}
                      </span>
                      <Badge
                        variant="secondary"
                        className={cn(
                          'rounded-full border-transparent text-[10px]',
                          statusPillClass(t.status),
                        )}
                      >
                        {STATUS_LABEL[t.status]}
                      </Badge>
                    </div>
                    <p className="mt-1.5 text-[10px] tabular-nums text-muted-foreground">
                      {format(new Date(t.dateIso), 'dd MMM yyyy · HH:mm')}
                      {(t.receiptNumber ?? t.proofReference) && (
                        <> · {t.receiptNumber ?? t.proofReference}</>
                      )}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {filtered.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
                <p>
                  Showing {page * PAGE_SIZE + 1} to{' '}
                  {Math.min(filtered.length, (page + 1) * PAGE_SIZE)} of {filtered.length}{' '}
                  transaction
                  {filtered.length === 1 ? '' : 's'}
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-8"
                    aria-label="Previous page"
                    disabled={page === 0}
                    onClick={() => setPageIdx(page - 1)}
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  {Array.from({ length: pageCount }, (_, i) => i)
                    .slice(Math.max(0, page - 2), Math.max(0, page - 2) + 5)
                    .map((i) => (
                      <Button
                        key={i}
                        variant={i === page ? 'default' : 'outline'}
                        size="icon"
                        className="size-8 text-xs"
                        aria-label={`Page ${i + 1}`}
                        aria-current={i === page ? 'page' : undefined}
                        onClick={() => setPageIdx(i)}
                      >
                        {i + 1}
                      </Button>
                    ))}
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-8"
                    aria-label="Next page"
                    disabled={page >= pageCount - 1}
                    onClick={() => setPageIdx(page + 1)}
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
            )}
          </section>
        </div>

        {/* ── Right rail ──────────────────────────────────────────── */}
        <div className="space-y-5">
          <section className="space-y-2 rounded-xl border bg-card p-4 shadow-sm ring-1 ring-border/60">
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

          <section className="rounded-xl border bg-card p-4 shadow-sm ring-1 ring-border/60">
            <div className="flex items-center gap-2">
              <Clock className="size-4 text-muted-foreground" aria-hidden />
              <h2 className="text-sm font-semibold text-foreground">Recent Activity</h2>
            </div>
            {data.activity.length === 0 ? (
              <p className="mt-3 text-xs text-muted-foreground">No billing activity yet.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {data.activity.map((a) => (
                  <li key={a.id} className="flex items-start gap-2.5">
                    <span
                      aria-hidden
                      className={cn(
                        'mt-0.5 grid size-6 shrink-0 place-items-center rounded-full',
                        a.kind === 'receipt'
                          ? 'bg-status-success-soft text-status-success'
                          : 'bg-sky-100 text-sky-700',
                      )}
                    >
                      {a.kind === 'receipt' ? (
                        <Check className="size-3" />
                      ) : (
                        <FileText className="size-3" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium leading-snug text-foreground">{a.title}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] text-muted-foreground">
                        <span className="truncate">{a.subtitle}</span>
                        <time dateTime={a.atIso} className="shrink-0 tabular-nums">
                          {format(new Date(a.atIso), 'dd MMM yyyy · HH:mm')}
                        </time>
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-info/30 bg-info/5 p-4">
            <div className="flex items-start gap-2.5">
              <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
              <div className="min-w-0 text-xs text-foreground/80">
                <p className="font-semibold text-foreground">Payment workflow</p>
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

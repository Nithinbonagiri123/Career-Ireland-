'use client';

import { format } from 'date-fns';
import {
  Briefcase,
  ChartNoAxesColumn,
  CreditCard,
  FileText,
  History,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Send,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { ProFormaComposer } from '@/app/(app)/leads/[id]/pro-formas/pro-forma-composer';
import { DirectPaymentDialog } from '@/app/(app)/leads/direct-payment-dialog';
import { DsStatusPill } from '@/components/ds/status-pill';
import { DS_SOFT, type DsTone } from '@/components/ds/tones';
import { EmptyState } from '@/components/empty-state';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { formatCurrency } from '@/lib/currency';
import { cn } from '@/lib/utils';
import type { InvoiceableService } from '@/modules/billing/read';
import { derivePaymentState } from '@/modules/clients/payment-state';
import { createServiceItemFromNameAction } from '@/modules/services-catalog/actions';
import { AddLeadButton } from './add-lead-button';
import { ComplimentaryGrantDialog } from './complimentary-grant-dialog';

/**
 * Stage 6G Screen 06 — Services & Billing tab, matching the approved
 * mockup: header card with + New quote / Create Pro Forma, a searchable
 * Available-services picker (select services → Create Pro Forma opens
 * the composer pre-filled), the Active-services column with a
 * create-new-service action card, and the Service history table. The
 * detailed per-engagement billing cards (verify / refund / record
 * payment) stay below under the #billing-detail anchor.
 */

export type ActiveServiceRow = {
  engagementId: string;
  serviceName: string;
  statusLabel: string;
  settled: boolean;
  /** Stage B Wave 4 — true when the live invoice on this engagement is a
   *  €0.00 complimentary grant; renders a distinct chip, never "Fully
   *  paid". */
  complimentary?: boolean;
  pfLine: string | null;
  agreed: string;
  paid: string;
  balance: string;
  currencyCode: string;
  pct: number;
};

export type ServiceHistoryRow = {
  key: string;
  dateIso: string | null;
  service: string;
  type: 'Quote' | 'Direct payment' | 'Complimentary';
  refLabel: string | null;
  refHref: string | null;
  printHref: string | null;
  amount: string;
  paid: string;
  balance: string;
  currencyCode: string;
  status:
    | 'Paid'
    | 'Partially paid'
    | 'Awaiting payment'
    | 'In progress'
    | 'Draft quote'
    | 'Complimentary';
};

const CARD_ICONS = [FileText, Briefcase, Users, MessageSquare, ChartNoAxesColumn, Send];
const CARD_TONES = (['blue', 'amber', 'violet', 'green', 'rose', 'teal'] as const).map(
  (t) => DS_SOFT[t],
);

/** Pill tone for the payment / service status labels used in this tab. */
function statusTone(label: string, opts?: { complimentary?: boolean; settled?: boolean }): DsTone {
  if (opts?.complimentary || label === 'Complimentary' || label === 'No payment due') return 'blue';
  if (opts?.settled || label === 'Paid') return 'green';
  if (label === 'Draft quote') return 'slate';
  return 'amber';
}

function servicePrice(
  s: InvoiceableService,
): { label: string; value: string; code: string } | null {
  const eur = s.packages.find((p) => p.currencyCode === 'EUR') ?? s.packages[0];
  if (eur)
    return {
      label: formatCurrency(eur.price, eur.currencyCode),
      value: eur.price,
      code: eur.currencyCode,
    };
  if (s.defaultPrice) {
    const code = s.defaultCurrencyCode ?? 'EUR';
    return { label: formatCurrency(s.defaultPrice, code), value: s.defaultPrice, code };
  }
  return null;
}

export function ServicesBillingTab({
  personId,
  personName,
  candidateInfo,
  leadId,
  services: initialServices,
  currencies,
  active,
  history,
  canComplimentary = false,
}: {
  personId: string;
  personName: string;
  /** Extra rows for the Direct Payment dialog's candidate-info step. */
  candidateInfo?: {
    email?: string | null;
    phone?: string | null;
    nationality?: string | null;
    country?: string | null;
    immigrationStatus?: string | null;
  };
  /** Active lead id for the composer / direct payment ('' when none). */
  leadId: string;
  services: InvoiceableService[];
  currencies: Array<{ code: string; name: string; symbol: string }>;
  /** Stage B Wave 4 — current user may grant complimentary services. */
  canComplimentary?: boolean;
  active: ActiveServiceRow[];
  history: ServiceHistoryRow[];
}) {
  const [localServices, setLocalServices] = useState<InvoiceableService[]>([]);
  const services = useMemo(() => {
    const byId = new Map<string, InvoiceableService>();
    for (const s of localServices) byId.set(s.id, s);
    for (const s of initialServices) if (!byId.has(s.id)) byId.set(s.id, s);
    return [...byId.values()];
  }, [initialServices, localServices]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [directPayOpen, setDirectPayOpen] = useState(false);

  const categories = useMemo(
    () =>
      [
        ...new Set(services.map((s) => s.categoryName).filter((c): c is string => Boolean(c))),
      ].sort(),
    [services],
  );

  const visibleServices = useMemo(() => {
    const q = search.trim().toLowerCase();
    return services.filter((s) => {
      if (category && s.categoryName !== category) return false;
      if (!q) return true;
      return `${s.name} ${s.description ?? ''}`.toLowerCase().includes(q);
    });
  }, [services, search, category]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Stage 6G Screen 08 — "Create Pro Forma" goes to the dedicated page,
  // carrying the current picker selection as ?services=<id,id> so the
  // form arrives pre-ticked.
  const createProFormaHref = `/clients/${personId}/create-pro-forma${
    selected.size > 0 ? `?services=${[...selected].sort().join(',')}` : ''
  }`;
  const createProFormaButton = leadId ? (
    <Link href={createProFormaHref} className={cn(buttonVariants(), 'inline-flex items-center')}>
      <FileText className="mr-1.5 size-4" aria-hidden />
      Create Pro Forma
    </Link>
  ) : (
    <Button disabled title="No active lead on this client">
      Create Pro Forma
    </Button>
  );

  // History filters.
  const [historySearch, setHistorySearch] = useState('');
  const [historyStatus, setHistoryStatus] = useState('');
  const [historyTime, setHistoryTime] = useState('');
  const visibleHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    const cutoff =
      historyTime === '30'
        ? Date.now() - 30 * 86_400_000
        : historyTime === '90'
          ? Date.now() - 90 * 86_400_000
          : null;
    return history.filter((h) => {
      if (q && !`${h.service} ${h.refLabel ?? ''}`.toLowerCase().includes(q)) return false;
      if (historyStatus && h.status !== historyStatus) return false;
      if (cutoff && (!h.dateIso || new Date(h.dateIso).getTime() < cutoff)) return false;
      return true;
    });
  }, [history, historySearch, historyStatus, historyTime]);

  return (
    <div className="space-y-5">
      {/* ── Header card ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:p-5">
        <div className="flex min-w-0 items-start gap-3">
          <span
            aria-hidden
            className={cn('grid size-10 shrink-0 place-items-center rounded-xl', DS_SOFT.blue)}
          >
            <CreditCard className="size-4.5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Services &amp; Billing
            </h2>
            <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground">
              Manage services for this candidate, create pro forma, process direct payments, and
              track billing status.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {leadId ? (
            <ProFormaComposer
              mode="create"
              leadId={leadId}
              services={services}
              currencies={currencies}
              triggerLabel="+ New quote"
              triggerVariant="outline"
            />
          ) : (
            <Button variant="outline" disabled title="No active lead on this client">
              + New quote
            </Button>
          )}
          {createProFormaButton}
        </div>
      </div>

      {/* ── Available services | Active services ────────────────── */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <span
                aria-hidden
                className={cn('grid size-9 shrink-0 place-items-center rounded-xl', DS_SOFT.blue)}
              >
                <Users className="size-4" />
              </span>
              <div className="min-w-0">
                <h3 className="text-[15px] font-semibold text-foreground">Available services</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Select services to add to this candidate.
                </p>
              </div>
            </div>
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <div className="relative min-w-0 flex-1 sm:w-52 sm:flex-none">
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search services…"
                  className="h-9 pl-8 text-xs"
                />
              </div>
              <Select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="h-9 w-36 text-xs"
                aria-label="Service category"
              >
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visibleServices.map((s, i) => {
              const Icon = CARD_ICONS[i % CARD_ICONS.length];
              const tone = CARD_TONES[i % CARD_TONES.length];
              const price = servicePrice(s);
              const isSelected = selected.has(s.id);
              return (
                <div
                  key={s.id}
                  className={cn(
                    'flex flex-col rounded-xl border p-3.5 transition-colors',
                    isSelected
                      ? 'border-primary/40 bg-sky-50 ring-1 ring-primary/20 dark:bg-sky-500/10'
                      : 'border-border/70 bg-background',
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    <span
                      aria-hidden
                      className={cn('grid size-9 shrink-0 place-items-center rounded-xl', tone)}
                    >
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold leading-tight text-foreground">
                        {s.name}
                      </p>
                      {s.description && (
                        <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                          {s.description}
                        </p>
                      )}
                    </div>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggle(s.id)}
                      aria-label={`Select ${s.name}`}
                      className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]"
                    />
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2 pt-1">
                    <span className="text-sm font-semibold tabular-nums text-foreground">
                      {price?.label ?? 'Custom price'}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8"
                      aria-pressed={isSelected}
                      onClick={() => toggle(s.id)}
                    >
                      {isSelected ? 'Selected ✓' : 'Add service'}
                    </Button>
                  </div>
                </div>
              );
            })}

            {/* Other / custom service card */}
            <div className="flex flex-col rounded-xl border border-dashed border-border/80 bg-muted/30 p-3.5">
              <div className="flex items-start gap-2.5">
                <span
                  aria-hidden
                  className={cn(
                    'grid size-9 shrink-0 place-items-center rounded-xl',
                    DS_SOFT.slate,
                  )}
                >
                  <MoreHorizontal className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-tight text-foreground">
                    Other Service
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Custom service as per candidate requirement
                  </p>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-end pt-1">
                <AddCustomServiceDialog
                  onCreated={(created) => {
                    setLocalServices((prev) => [created, ...prev]);
                    setSelected((prev) => new Set(prev).add(created.id));
                  }}
                />
              </div>
            </div>
          </div>
        </section>

        {/* ── Right column ─────────────────────────────────────── */}
        <div className="space-y-5">
          <section className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:p-5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-start gap-3">
                <span
                  aria-hidden
                  className={cn('grid size-9 shrink-0 place-items-center rounded-xl', DS_SOFT.teal)}
                >
                  <FileText className="size-4" />
                </span>
                <h3 className="text-[15px] font-semibold text-foreground">
                  Active services for this candidate{' '}
                  <span className="font-normal text-muted-foreground">({active.length})</span>
                </h3>
              </div>
              <a
                href="#billing-detail"
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'shrink-0')}
              >
                View all
              </a>
            </div>

            <div className="mt-4 space-y-3">
              {active.length === 0 ? (
                <EmptyState
                  icon={FileText}
                  title="No services on file yet"
                  description="Select services on the left and create a pro forma."
                  className="py-6"
                />
              ) : (
                active.map((a) => (
                  <a
                    key={a.engagementId}
                    href="#billing-detail"
                    className="block rounded-xl border border-border/70 bg-background p-3.5 transition-colors hover:border-primary/30 hover:bg-sky-50/50 dark:hover:bg-sky-500/10"
                  >
                    <div className="flex items-start gap-2.5">
                      <span
                        aria-hidden
                        className={cn(
                          'grid size-9 shrink-0 place-items-center rounded-xl',
                          DS_SOFT.blue,
                        )}
                      >
                        <FileText className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {a.serviceName}
                          </p>
                          <DsStatusPill className="shrink-0" tone={statusTone(a.statusLabel, a)}>
                            {a.complimentary ? 'Complimentary' : a.statusLabel}
                          </DsStatusPill>
                        </div>
                        {a.pfLine && (
                          <p className="truncate text-[10px] text-muted-foreground">{a.pfLine}</p>
                        )}
                        <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                          <div>
                            <p className="text-muted-foreground">Total amount</p>
                            <p className="mt-0.5 font-semibold tabular-nums text-foreground">
                              {formatCurrency(a.agreed, a.currencyCode)}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Paid</p>
                            <p className="mt-0.5 font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                              {formatCurrency(a.paid, a.currencyCode)}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Balance</p>
                            <p className="mt-0.5 font-semibold tabular-nums text-foreground">
                              {formatCurrency(a.balance, a.currencyCode)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                            <div
                              className={cn(
                                'h-full rounded-full',
                                a.settled ? 'bg-emerald-500' : 'bg-primary',
                              )}
                              style={{ width: `${a.pct}%` }}
                            />
                          </div>
                          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                            {a.pct}%
                          </span>
                          <DsStatusPill className="shrink-0" tone={statusTone('', a)}>
                            {/* Stage C1 — same shared three-state derivation
                                as Service history, so the two surfaces can
                                never disagree. */}
                            {a.complimentary
                              ? 'No payment due'
                              : derivePaymentState(a.agreed, a.paid)}
                          </DsStatusPill>
                        </div>
                      </div>
                    </div>
                  </a>
                ))
              )}
            </div>
          </section>

          {/* Create-new-service action card */}
          <section className="rounded-2xl border border-sky-200/70 bg-sky-50/60 p-4 shadow-sm sm:p-5 dark:border-sky-500/20 dark:bg-sky-500/10">
            <div className="flex items-start gap-3">
              <span
                aria-hidden
                className={cn('grid size-9 shrink-0 place-items-center rounded-xl', DS_SOFT.blue)}
              >
                <Pencil className="size-4" />
              </span>
              <div className="min-w-0">
                <h3 className="text-[15px] font-semibold text-foreground">
                  Create new service for this candidate
                </h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Add a service, create a pro forma or take a direct payment.
                </p>
              </div>
            </div>
            <div className="mt-3.5 flex flex-wrap items-center gap-2">
              <AddCustomServiceDialog
                triggerLabel="+ Add service"
                onCreated={(created) => {
                  setLocalServices((prev) => [created, ...prev]);
                  setSelected((prev) => new Set(prev).add(created.id));
                }}
              />
              {createProFormaButton}
              {/* Stage C workflow collapse — without a lead, the first
                  step IS creating one, right here; with a lead, the
                  payment action takes its place. */}
              {leadId ? (
                <Button type="button" onClick={() => setDirectPayOpen(true)}>
                  <CreditCard className="mr-1.5 size-4" aria-hidden />
                  Direct Payment &amp; Activate
                </Button>
              ) : (
                <AddLeadButton personId={personId} />
              )}
              {canComplimentary && (
                <ComplimentaryGrantDialog
                  personId={personId}
                  services={services}
                  currencies={currencies}
                />
              )}
            </div>
          </section>
        </div>
      </div>

      {/* ── Service history ──────────────────────────────────────── */}
      <section className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden
              className={cn('grid size-9 shrink-0 place-items-center rounded-xl', DS_SOFT.violet)}
            >
              <History className="size-4" />
            </span>
            <h3 className="text-[15px] font-semibold text-foreground">
              Service history{' '}
              <span className="font-normal text-muted-foreground">(all services)</span>
            </h3>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <div className="relative min-w-0 flex-1 sm:w-52 sm:flex-none">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Search services…"
                className="h-9 pl-8 text-xs"
              />
            </div>
            <Select
              value={historyStatus}
              onChange={(e) => setHistoryStatus(e.target.value)}
              className="h-9 w-36 text-xs"
              aria-label="History status filter"
            >
              <option value="">All statuses</option>
              <option value="Paid">Paid</option>
              <option value="Partially paid">Partially paid</option>
              <option value="In progress">In progress</option>
              <option value="Draft quote">Draft quote</option>
            </Select>
            <Select
              value={historyTime}
              onChange={(e) => setHistoryTime(e.target.value)}
              className="h-9 w-32 text-xs"
              aria-label="History time filter"
            >
              <option value="">All time</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
            </Select>
          </div>
        </div>

        {visibleHistory.length === 0 ? (
          <EmptyState
            icon={History}
            title="No billing history for this candidate yet"
            className="py-6"
          />
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-border/60">
            <table className="w-full min-w-[720px] text-xs">
              <thead className="bg-muted/40">
                <tr className="border-b border-border/60 text-left text-muted-foreground">
                  <th className="py-2.5 pl-4 pr-3 font-medium">Date</th>
                  <th className="py-2.5 pr-3 font-medium">Service</th>
                  <th className="py-2.5 pr-3 font-medium">Type</th>
                  <th className="py-2.5 pr-3 font-medium">Pro Forma / Invoice</th>
                  <th className="py-2.5 pr-3 text-right font-medium">Amount</th>
                  <th className="py-2.5 pr-3 text-right font-medium">Paid</th>
                  <th className="py-2.5 pr-3 text-right font-medium">Balance</th>
                  <th className="py-2.5 pr-3 font-medium">Status</th>
                  <th className="py-2.5 pr-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleHistory.map((h) => (
                  <tr key={h.key} className="border-b border-border/60 last:border-b-0">
                    <td className="py-3 pl-4 pr-3 text-muted-foreground">
                      {h.dateIso ? (
                        <time dateTime={h.dateIso} className="tabular-nums">
                          {format(new Date(h.dateIso), 'dd MMM yyyy · HH:mm')}
                        </time>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="py-3 pr-3 font-medium text-foreground">{h.service}</td>
                    <td className="py-3 pr-3 text-muted-foreground">{h.type}</td>
                    <td className="py-3 pr-3">
                      {h.refLabel && h.refHref ? (
                        <Link
                          href={h.refHref}
                          className="font-medium text-primary underline-offset-2 hover:underline"
                        >
                          {h.refLabel}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-3 pr-3 text-right tabular-nums text-foreground">
                      {formatCurrency(h.amount, h.currencyCode)}
                    </td>
                    <td className="py-3 pr-3 text-right tabular-nums text-emerald-700 dark:text-emerald-300">
                      {formatCurrency(h.paid, h.currencyCode)}
                    </td>
                    <td className="py-3 pr-3 text-right tabular-nums text-foreground">
                      {formatCurrency(h.balance, h.currencyCode)}
                    </td>
                    <td className="py-3 pr-3">
                      <DsStatusPill tone={statusTone(h.status)}>{h.status}</DsStatusPill>
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-1.5">
                        {h.refHref && (
                          <Link
                            href={h.refHref}
                            className={cn(
                              buttonVariants({ variant: 'outline', size: 'sm' }),
                              'h-7 px-2 text-[11px]',
                            )}
                          >
                            View
                          </Link>
                        )}
                        {h.printHref && (
                          <Link
                            href={h.printHref}
                            target="_blank"
                            className={cn(
                              buttonVariants({ variant: 'ghost', size: 'sm' }),
                              'h-7 px-2 text-[11px]',
                            )}
                          >
                            PDF
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {leadId && (
        <DirectPaymentDialog
          lead={{ id: leadId, displayName: personName, personId }}
          candidate={candidateInfo}
          services={services}
          defaultCurrencyCode="EUR"
          open={directPayOpen}
          onOpenChange={setDirectPayOpen}
        />
      )}
    </div>
  );
}

/** "+ Add service" / "Add custom" — inline catalog creation, reusable
 *  everywhere afterwards (same action the create-lead dialog uses). */
function AddCustomServiceDialog({
  onCreated,
  triggerLabel = 'Add custom',
}: {
  onCreated: (created: InvoiceableService) => void;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [pending, startTransition] = useTransition();

  const submit = () =>
    startTransition(async () => {
      const r = await createServiceItemFromNameAction({ name: name.trim() });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      onCreated({
        id: r.data.id,
        code: r.data.code,
        name: r.data.name,
        description: null,
        categoryName: null,
        defaultPrice: null,
        defaultCurrencyCode: null,
        payerType: r.data.payerType,
        packages: [],
      });
      toast.success(`Service "${r.data.name}" added to the catalog`);
      setName('');
      setOpen(false);
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline">
            <Plus className="mr-1.5 size-4" aria-hidden />
            {triggerLabel}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a custom service</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <label htmlFor="custom-svc-name" className="text-xs font-medium text-foreground/80">
            Service name
          </label>
          <Input
            id="custom-svc-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Portfolio review"
            autoFocus
          />
          <p className="text-[11px] text-muted-foreground">
            Added to the services catalog, so it becomes reusable for every candidate. Set the price
            when you create the pro forma.
          </p>
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
          <Button type="button" onClick={submit} disabled={pending || name.trim().length < 2}>
            Add service
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

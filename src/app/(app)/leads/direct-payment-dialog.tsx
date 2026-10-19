'use client';

import { ArrowRight, Banknote, CreditCard, Landmark, Loader2, Lock, Wallet } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { formatCurrency } from '@/lib/currency';
import { todayInDublin } from '@/lib/dates';
import { cn } from '@/lib/utils';
import type { InvoiceableService } from '@/modules/billing/read';
import { directPaymentAndConvertAction } from '@/modules/clients/direct-payment';

/**
 * Stage 6G Screen 10 — Direct Payment & Convert, restyled as the
 * approved 4-step dialog: candidate information → service selection
 * (checkbox table with editable prices) → payment details with method
 * tabs → confirmation. The business flow is unchanged from Stage 6E:
 * one server transaction records the completed payment, issues the
 * official invoice + receipt, and activates the candidate. Full
 * payment only; partial amounts are redirected to the quote flow.
 *
 * No card data is ever collected — the Card tab records only the
 * operator-entered terminal / processor reference.
 */

type MethodTab = 'CARD' | 'BANK_TRANSFER' | 'CASH' | 'OTHER';

const METHOD_TABS: Array<{ value: MethodTab; label: string; icon: typeof CreditCard }> = [
  { value: 'CARD', label: 'Card payment', icon: CreditCard },
  { value: 'BANK_TRANSFER', label: 'Bank transfer', icon: Landmark },
  { value: 'CASH', label: 'Cash', icon: Banknote },
  { value: 'OTHER', label: 'Other', icon: Wallet },
];

function StepHeader({ n, title, sub }: { n: number; title: string; sub?: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span
        aria-hidden
        className="grid size-6 shrink-0 place-items-center rounded-full bg-sky-600 text-[11px] font-bold text-white"
      >
        {n}
      </span>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

export function DirectPaymentDialog({
  lead,
  candidate,
  services,
  defaultCurrencyCode,
  open,
  onOpenChange,
}: {
  lead: {
    id: string;
    displayName: string;
    personId: string | null;
  };
  /** Optional extra rows for the step-1 information grid. */
  candidate?: {
    email?: string | null;
    phone?: string | null;
    nationality?: string | null;
    country?: string | null;
    immigrationStatus?: string | null;
  };
  services: InvoiceableService[];
  defaultCurrencyCode: string;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  type Row = { id: string; name: string; description: string; price: string; selected: boolean };
  const buildRows = useMemo(
    () => (): Row[] =>
      services.map((s, i) => {
        const pkg = s.packages.find((p) => p.currencyCode === defaultCurrencyCode) ?? s.packages[0];
        return {
          id: s.id,
          name: s.name,
          description: s.description ?? '',
          price: pkg?.price ?? s.defaultPrice ?? '',
          selected: i === 0,
        };
      }),
    [services, defaultCurrencyCode],
  );
  const [rows, setRows] = useState<Row[]>(buildRows);
  const [currency, setCurrency] = useState<string>(defaultCurrencyCode);
  const [method, setMethod] = useState<MethodTab>('CARD');
  const [paymentDate, setPaymentDate] = useState<string>(() => todayInDublin());
  const [reference, setReference] = useState<string>('');
  const [overrideReason, setOverrideReason] = useState<string>('');
  const [showOverride, setShowOverride] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Currency follows the first selected service's package, matching
  // the old prefill behaviour.
  const firstSelectedId = rows.find((r) => r.selected)?.id;
  useEffect(() => {
    if (!firstSelectedId) return;
    const svc = services.find((s) => s.id === firstSelectedId);
    const pkg = svc?.packages[0];
    if (pkg) setCurrency(pkg.currencyCode);
  }, [firstSelectedId, services]);

  const selected = rows.filter((r) => r.selected && r.price);
  const totalCents = selected.reduce(
    (acc, r) => acc + Math.round(Number.parseFloat(r.price || '0') * 100),
    0,
  );
  const total = (totalCents / 100).toFixed(2);

  const dialogSeed = useId();
  // Fresh idempotency key per dialog mount; a reopen gets a new one.
  const idempotencyKey = useMemo(
    () => `dp-${dialogSeed}-${open ? Date.now() : ''}`,
    [dialogSeed, open],
  );

  function reset() {
    setRows(buildRows());
    setCurrency(defaultCurrencyCode);
    setMethod('CARD');
    setPaymentDate(todayInDublin());
    setReference('');
    setOverrideReason('');
    setShowOverride(false);
    setError(null);
  }

  function submit() {
    setError(null);
    if (selected.length === 0) {
      setError('Select at least one service with a price.');
      return;
    }
    if (!lead.personId) {
      setError('This lead has no person attached.');
      return;
    }
    const trimmedRef = reference.trim();
    const first = selected[0] as Row;
    startTransition(async () => {
      const r = await directPaymentAndConvertAction({
        leadId: lead.id,
        serviceCatalogItemId: first.id,
        agreedAmount: total,
        paymentAmount: total,
        currencyCode: currency,
        methodDisplay: method,
        paymentDate,
        reference: trimmedRef || null,
        idempotencyKey,
        overrideDuplicateReason: showOverride ? overrideReason.trim() || null : null,
        services: selected.map((s) => ({
          serviceCatalogItemId: s.id,
          name: s.name,
          amount: Number.parseFloat(s.price).toFixed(2),
        })),
      });
      if (r.ok) {
        if (r.data.alreadyProcessed) {
          toast.success(
            `Already processed — invoice ${r.data.invoiceNumber} / receipt ${r.data.receiptNumber}.`,
          );
        } else {
          toast.success(
            `Payment recorded. Invoice ${r.data.invoiceNumber}, receipt ${r.data.receiptNumber} issued. Candidate activated.`,
          );
        }
        onOpenChange(false);
        reset();
        router.push(`/clients/${r.data.personId}?tab=services-billing`);
        router.refresh();
      } else {
        const code = (r.error as { code?: string }).code;
        if (code === 'DIRECT_PAYMENT_REQUIRES_FULL_AMOUNT') {
          setError(
            `${r.error.message} Open the Client Workspace, create a quote, then record the partial payment there.`,
          );
          return;
        }
        if (code === 'DIRECT_PAYMENT_DUPLICATE_LIKELY') {
          setShowOverride(true);
          setError(r.error.message);
          return;
        }
        setError(r.error.message);
      }
    });
  }

  const infoRows: Array<[string, string]> = [
    ['Name', lead.displayName],
    ['Email', candidate?.email || '—'],
    ['Phone', candidate?.phone || '—'],
    ['Nationality', candidate?.nationality || '—'],
    ['Country of residence', candidate?.country || '—'],
    ['Irish immigration status', candidate?.immigrationStatus || '—'],
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Direct Payment &amp; Convert to Candidate</DialogTitle>
          <DialogDescription>
            Process a direct payment, generate an invoice and convert this lead to an active
            candidate. For partial payments use a quote instead.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* ── Step 1 · Candidate information ──────────────────── */}
          <section aria-label="Candidate information">
            <StepHeader n={1} title="Candidate information" />
            <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 rounded-lg border bg-muted/20 p-3.5 text-xs sm:grid-cols-2">
              {infoRows.map(([label, value]) => (
                <div key={label} className="flex items-baseline gap-2">
                  <dt className="w-28 shrink-0 text-muted-foreground">{label}</dt>
                  <dd className="min-w-0 flex-1 truncate font-medium text-foreground">{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          {/* ── Step 2 · Select services ────────────────────────── */}
          <section aria-label="Select services">
            <StepHeader
              n={2}
              title="Select services"
              sub="Choose one or more services to include in this payment."
            />
            <div className="mt-3 overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[420px] text-xs">
                <thead>
                  <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                    <th className="w-9 px-3 py-2" aria-label="Included" />
                    <th className="py-2 pr-3 font-medium">Service</th>
                    <th className="py-2 pr-3 font-medium">Description</th>
                    <th className="py-2 pr-3 text-right font-medium">Price ({currency})</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      className={cn(
                        'border-b last:border-b-0',
                        !r.selected && 'text-muted-foreground',
                      )}
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={r.selected}
                          disabled={pending}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setRows((prev) =>
                              prev.map((x) => (x.id === r.id ? { ...x, selected: checked } : x)),
                            );
                          }}
                          aria-label={`Include ${r.name}`}
                          className="size-4 accent-sky-600"
                        />
                      </td>
                      <td className="py-2 pr-3 font-medium text-foreground">{r.name}</td>
                      <td className="max-w-52 truncate py-2 pr-3">{r.description}</td>
                      <td className="py-2 pr-3 text-right">
                        <Input
                          value={r.price}
                          disabled={pending}
                          onChange={(e) => {
                            const v = e.target.value;
                            setRows((prev) =>
                              prev.map((x) => (x.id === r.id ? { ...x, price: v } : x)),
                            );
                          }}
                          inputMode="decimal"
                          aria-label={`Price for ${r.name}`}
                          className="ml-auto h-8 w-24 text-right text-xs tabular-nums"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── Step 3 · Payment details ────────────────────────── */}
          <section aria-label="Payment details">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <StepHeader n={3} title="Payment details" />
              <span className="text-xl font-bold tabular-nums text-sky-700">
                {formatCurrency(total, currency)}
              </span>
            </div>
            <div className="mt-3 space-y-3">
              <fieldset
                className="flex overflow-hidden rounded-lg border"
                aria-label="Payment method"
              >
                {METHOD_TABS.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    disabled={pending}
                    onClick={() => setMethod(value)}
                    aria-pressed={method === value}
                    className={cn(
                      'inline-flex flex-1 items-center justify-center gap-1.5 border-r px-2 py-2 text-xs font-medium transition-colors last:border-r-0',
                      method === value
                        ? 'bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-300'
                        : 'bg-background text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <Icon className="size-3.5" aria-hidden />
                    {label}
                  </button>
                ))}
              </fieldset>
              {method === 'CARD' && (
                <p className="flex items-start gap-1.5 rounded-md border border-sky-200/70 bg-sky-50/60 px-3 py-2 text-[11px] text-foreground/80">
                  <Lock className="mt-0.5 size-3 shrink-0 text-sky-700" aria-hidden />
                  Card payments are taken on the external terminal — no card details are entered or
                  stored here. Record the terminal / processor receipt reference below.
                </p>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="dp-date">Payment date</Label>
                  <Input
                    id="dp-date"
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    disabled={pending}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="dp-ref">
                    Reference number{' '}
                    <span className="text-xs font-normal text-muted-foreground">
                      (optional; not required for cash)
                    </span>
                  </Label>
                  <Input
                    id="dp-ref"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    disabled={pending}
                    maxLength={500}
                    placeholder="Bank line / terminal receipt id / cash slip"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* ── Step 4 · Confirmation ───────────────────────────── */}
          <section aria-label="Confirmation">
            <StepHeader n={4} title="Confirmation" />
            <ul className="mt-3 space-y-1.5 rounded-lg border border-sky-200/70 bg-sky-50/50 p-3.5 text-xs text-foreground/90">
              <li>✓ An official invoice and receipt are generated after successful payment.</li>
              <li>✓ This lead is converted to an active candidate.</li>
            </ul>
          </section>

          {showOverride && (
            <div className="space-y-1.5 rounded-md border border-amber-400/40 bg-amber-50 p-3 text-xs dark:bg-amber-900/30">
              <Label htmlFor="dp-override" className="text-amber-900 dark:text-amber-100">
                Reason for proceeding despite a possible duplicate
              </Label>
              <Textarea
                id="dp-override"
                rows={2}
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                disabled={pending}
                maxLength={500}
              />
            </div>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <div className="flex items-center justify-between gap-2 border-t pt-4">
          <DialogClose render={<Button variant="outline" type="button" disabled={pending} />}>
            Cancel
          </DialogClose>
          <Button
            type="button"
            onClick={submit}
            disabled={pending || !lead.personId}
            className="font-semibold"
          >
            {pending && <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden />}
            Process payment, create invoice and convert
            <ArrowRight className="ml-1.5 size-4" aria-hidden />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

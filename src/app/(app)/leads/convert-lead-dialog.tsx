'use client';

import { Loader2, UserCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { formatMoney } from '@/components/ds/money';
import { DsEnumPill } from '@/components/ds/status-pill';
import { Timestamp } from '@/components/timestamp';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { todayInDublin } from '@/lib/dates';
import { cn } from '@/lib/utils';
import type { InvoiceableService } from '@/modules/billing/read';
import { acceptLeadAction, fetchLeadConversionOptionsAction } from '@/modules/leads/actions';
import { servicesForTarget } from '@/modules/leads/conversion-rules';
import type { LeadListRow } from '@/modules/leads/repository';
import type { LeadConversionOptions } from '@/modules/leads/service';

type Method = 'BANK_TRANSFER' | 'CASH' | 'OTHER';
type Mode = 'EXISTING_INVOICE' | 'NEW_PAYMENT';

const SELECT_CLASS =
  'h-9 w-full rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30';

/**
 * Convert a lead into its target business — one dialog, one confirmation.
 *
 * Recruitment P0: an employer enquiry converts either by using an invoice
 * the employer has already paid (finance-verified; nothing new is charged)
 * or by recording the payment here. The server refuses a new payment while
 * an existing employer invoice could be the same money; only finance may
 * confirm a separate charge, with a reason.
 *
 * `lead` stays set while the dialog animates closed (the parent only flips
 * `open`), so the closing frame never shows an empty, mistitled dialog.
 */
export function ConvertLeadDialog({
  lead,
  open,
  onOpenChange,
  personServices,
  employerServices,
  canVerifyPayments,
}: {
  lead: LeadListRow;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  personServices: InvoiceableService[];
  employerServices: InvoiceableService[];
  canVerifyPayments: boolean;
}) {
  const router = useRouter();
  const isRecruitment = lead.targetBusiness === 'RECRUITMENT';
  const services = useMemo(
    () => servicesForTarget(lead.targetBusiness, isRecruitment ? employerServices : personServices),
    [lead.targetBusiness, isRecruitment, employerServices, personServices],
  );
  const firstService = services[0];
  const firstPkg = firstService?.packages[0];

  const [options, setOptions] = useState<LeadConversionOptions | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(isRecruitment);
  const [mode, setMode] = useState<Mode>('NEW_PAYMENT');
  const [invoiceId, setInvoiceId] = useState('');
  const [serviceId, setServiceId] = useState(firstService?.id ?? '');
  const [amount, setAmount] = useState(firstPkg?.price ?? firstService?.defaultPrice ?? '');
  const [currency, setCurrency] = useState(
    firstPkg?.currencyCode ?? firstService?.defaultCurrencyCode ?? 'EUR',
  );
  const [method, setMethod] = useState<Method>('BANK_TRANSFER');
  const [receivedAt, setReceivedAt] = useState(todayInDublin());
  const [reference, setReference] = useState('');
  const [reason, setReason] = useState('');
  const [confirmSeparate, setConfirmSeparate] = useState(false);
  const [separateReason, setSeparateReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Recruitment: load the employer's relevant invoices once per lead and
  // default to "use an existing invoice" when one is ready to use.
  useEffect(() => {
    if (!isRecruitment) return;
    let cancelled = false;
    setLoadingOptions(true);
    fetchLeadConversionOptionsAction({ leadId: lead.id }).then((r) => {
      if (cancelled) return;
      setLoadingOptions(false);
      if (!r.ok) {
        setError(r.error.message);
        return;
      }
      setOptions(r.data);
      const usable = r.data.invoices.find((i) => i.usable);
      if (usable) {
        setMode('EXISTING_INVOICE');
        setInvoiceId(usable.id);
      } else if (r.data.invoices.length > 0) {
        setMode('EXISTING_INVOICE');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isRecruitment, lead.id]);

  const invoices = options?.invoices ?? [];
  const blocking = options?.blockingInvoiceNumbers ?? [];
  const selectedInvoice = invoices.find((i) => i.id === invoiceId);
  const today = todayInDublin();

  const newPaymentValid =
    serviceId.length > 0 &&
    Number(amount) > 0 &&
    /^[A-Z]{3}$/.test(currency) &&
    reason.trim().length >= 3 &&
    (!receivedAt || receivedAt <= today) &&
    (blocking.length === 0 ||
      (canVerifyPayments && confirmSeparate && separateReason.trim().length >= 3));
  const existingValid = Boolean(selectedInvoice?.usable);
  const valid = mode === 'EXISTING_INVOICE' ? existingValid : newPaymentValid;

  const onServiceChange = (next: string) => {
    setServiceId(next);
    const svc = services.find((s) => s.id === next);
    const pkg = svc?.packages[0];
    setAmount(pkg?.price ?? svc?.defaultPrice ?? '');
    setCurrency(pkg?.currencyCode ?? svc?.defaultCurrencyCode ?? 'EUR');
  };

  const submit = () => {
    if (!valid || pending) return;
    setError(null);
    startTransition(async () => {
      const result =
        mode === 'EXISTING_INVOICE'
          ? await acceptLeadAction({
              leadId: lead.id,
              existingInvoiceId: invoiceId,
              reason: reason.trim(),
            })
          : await acceptLeadAction({
              leadId: lead.id,
              reason: reason.trim(),
              serviceCatalogItemId: serviceId,
              amount,
              currencyCode: currency,
              method,
              proofReference: reference.trim(),
              receivedAt,
              confirmSeparateCharge: blocking.length > 0 ? confirmSeparate : undefined,
              separateChargeReason: blocking.length > 0 ? separateReason.trim() : undefined,
            });
      if (!result.ok) {
        setError(result.error.message);
        toast.error(result.error.message);
        return;
      }
      const landedAs =
        result.data.targetBusiness === 'RECRUITMENT'
          ? 'requisition'
          : result.data.targetBusiness === 'IMMIGRATION'
            ? 'immigration case'
            : 'candidate';
      toast.success(`${lead.displayName} converted — ${landedAs} created`);
      onOpenChange(false);
      router.refresh();
      // Deep-link to the freshly-created operational entity so the
      // operator lands in context (invoices + docs attached).
      if (result.data.targetBusiness === 'IMMIGRATION') {
        router.push(`/immigration/${result.data.entityId}`);
      } else if (result.data.targetBusiness === 'RECRUITMENT') {
        router.push(`/requisitions/${result.data.entityId}`);
      } else if (lead.personId) {
        router.push(`/candidates/${lead.personId}`);
      }
    });
  };

  const title = isRecruitment
    ? 'Convert → open requisition'
    : lead.targetBusiness === 'IMMIGRATION'
      ? 'Convert → open immigration case'
      : 'Record payment outside a quote';

  const payerLabel = lead.displayName;
  const amountLabel = Number(amount) > 0 ? formatMoney(amount, currency || 'EUR') : '—';

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {isRecruitment ? (
              <>
                Converting <span className="font-medium text-foreground">{payerLabel}</span> into a
                requisition. The employer's payment must be in: use the invoice they have paid, or
                record the payment here.
              </>
            ) : lead.targetBusiness === 'IMMIGRATION' ? (
              <>
                Converting <span className="font-medium text-foreground">{payerLabel}</span>. A lead
                becomes a case once the payment is in — record it here and the case, invoice,
                payment and receipt are created in one step.
              </>
            ) : (
              <>
                Exceptional path for{' '}
                <span className="font-medium text-foreground">{payerLabel}</span> — use only when
                the client already paid outside the quote flow.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {lead.targetBusiness === 'CANDIDATE_SERVICES' && (
            <div className="space-y-2 rounded-md border border-amber-400/40 bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">
              <p>
                This creates an engagement, an invoice, a payment and a receipt in one step without
                a client-visible quote. The reason you give below is written to the audit log.
              </p>
              <p>
                Prefer the standard flow: open the Client Workspace, create a quote, record the
                payment against it, then activate the candidate.
              </p>
            </div>
          )}

          {isRecruitment && (
            <fieldset className="space-y-2">
              <legend className="mb-1 text-sm font-medium">How has the employer paid?</legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <ModeOption
                  checked={mode === 'EXISTING_INVOICE'}
                  onSelect={() => setMode('EXISTING_INVOICE')}
                  label="Use an existing invoice"
                  hint="They paid an invoice we already issued"
                />
                <ModeOption
                  checked={mode === 'NEW_PAYMENT'}
                  onSelect={() => setMode('NEW_PAYMENT')}
                  label="Record a new payment"
                  hint="No invoice yet — record what was received"
                />
              </div>
            </fieldset>
          )}

          {isRecruitment && mode === 'EXISTING_INVOICE' && (
            <div className="space-y-2" data-testid="existing-invoice-list">
              {loadingOptions ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" aria-hidden /> Loading the employer's
                  invoices…
                </p>
              ) : invoices.length === 0 ? (
                <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                  This employer has no open or recently paid invoice. Record the payment instead, or
                  ask Finance to issue the invoice first.
                </p>
              ) : (
                <div role="radiogroup" aria-label="Employer invoices" className="space-y-2">
                  {invoices.map((inv) => (
                    <label
                      key={inv.id}
                      className={cn(
                        'flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition-colors',
                        inv.usable ? 'hover:bg-muted/50' : 'cursor-not-allowed opacity-75',
                        invoiceId === inv.id && 'border-primary ring-1 ring-primary/40',
                      )}
                    >
                      <input
                        type="radio"
                        name="existing-invoice"
                        value={inv.id}
                        checked={invoiceId === inv.id}
                        disabled={!inv.usable}
                        onChange={() => setInvoiceId(inv.id)}
                        className="mt-1"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-mono font-medium">{inv.number}</span>
                          <DsEnumPill status={inv.status} />
                          <span className="ml-auto font-medium tabular-nums">
                            {formatMoney(inv.totalAmount, inv.currencyCode)}
                          </span>
                        </span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          Issued <Timestamp date={inv.issuedAt} absoluteOnly />
                        </span>
                        {inv.blockedReason ? (
                          <span className="mt-1 block text-xs text-amber-800 dark:text-amber-200">
                            {inv.blockedReason}
                          </span>
                        ) : (
                          <span className="mt-1 block text-xs text-emerald-700 dark:text-emerald-300">
                            Paid in full and verified by Finance
                          </span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              )}
              <div className="space-y-1">
                <Label htmlFor="convertNote">Note (optional, audited)</Label>
                <Input
                  id="convertNote"
                  autoComplete="off"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Fee agreed on the call with the hiring manager"
                />
              </div>
              {selectedInvoice?.usable && (
                <p className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
                  {selectedInvoice.number} (
                  {formatMoney(selectedInvoice.totalAmount, selectedInvoice.currencyCode)}) will be
                  linked to this enquiry and the new requisition. No new invoice, payment or receipt
                  is created.
                </p>
              )}
            </div>
          )}

          {(!isRecruitment || mode === 'NEW_PAYMENT') && (
            <>
              {isRecruitment && blocking.length > 0 && (
                <div
                  role="alert"
                  className="space-y-2 rounded-md border border-amber-400/40 bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-900/30 dark:text-amber-100"
                >
                  <p className="font-medium">
                    This employer already has invoice {blocking.join(', ')}.
                  </p>
                  <p>
                    Recording a new payment could charge them twice. Use the existing invoice
                    instead
                    {canVerifyPayments ? ', or confirm this really is a separate charge.' : '.'}
                  </p>
                  {canVerifyPayments ? (
                    <>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={confirmSeparate}
                          onChange={(e) => setConfirmSeparate(e.target.checked)}
                        />
                        This is a separate charge (Finance)
                      </label>
                      {confirmSeparate && (
                        <div className="space-y-1">
                          <Label htmlFor="separateReason">Why is it separate? (audited)</Label>
                          <Input
                            id="separateReason"
                            autoComplete="off"
                            value={separateReason}
                            onChange={(e) => setSeparateReason(e.target.value)}
                            placeholder="e.g. Second role agreed separately on 30 Oct"
                          />
                        </div>
                      )}
                    </>
                  ) : (
                    <p>Only Finance can confirm a separate charge.</p>
                  )}
                </div>
              )}

              <div className="space-y-1">
                <Label htmlFor="convertService">Service *</Label>
                <select
                  id="convertService"
                  value={serviceId}
                  onChange={(e) => onServiceChange(e.target.value)}
                  className={SELECT_CLASS}
                >
                  <option value="">— Pick a service —</option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                {services.length === 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    No active {isRecruitment ? 'employer' : 'client'} services in the catalog.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="convertAmount">Amount *</Label>
                  <Input
                    id="convertAmount"
                    type="number"
                    step="0.01"
                    min="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="100.00"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="convertCurrency">Currency *</Label>
                  <Input
                    id="convertCurrency"
                    maxLength={3}
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                    placeholder="EUR"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="convertMethod">Method *</Label>
                  <select
                    id="convertMethod"
                    value={method}
                    onChange={(e) => setMethod(e.target.value as Method)}
                    className={SELECT_CLASS}
                  >
                    <option value="BANK_TRANSFER">Bank transfer</option>
                    <option value="CASH">Cash</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="convertReceivedAt">Received on</Label>
                  <Input
                    id="convertReceivedAt"
                    type="date"
                    max={today}
                    value={receivedAt}
                    onChange={(e) => setReceivedAt(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="convertReference">Reference</Label>
                <Input
                  id="convertReference"
                  autoComplete="off"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Bank txn ID, screenshot URL, …"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="convertReason">Reason (audited) *</Label>
                <Input
                  id="convertReason"
                  autoComplete="off"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Bank transfer received today"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && valid) {
                      e.preventDefault();
                      submit();
                    }
                  }}
                />
                <p className="text-[11px] text-muted-foreground">
                  At least 3 characters. Written to the audit log.
                </p>
              </div>

              <p className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
                Records <span className="font-medium text-foreground">{amountLabel}</span> received
                from <span className="font-medium text-foreground">{payerLabel}</span>
                {receivedAt ? ` on ${receivedAt}` : ''}, with a new invoice and{' '}
                {canVerifyPayments
                  ? 'receipt — you are confirming the money has arrived (verified now).'
                  : 'the payment left pending until Finance verifies it.'}
              </p>
            </>
          )}

          {error && (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid || pending}>
            {pending ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden />
            ) : (
              <UserCheck className="mr-1.5 size-4" aria-hidden />
            )}
            {mode === 'EXISTING_INVOICE' && isRecruitment
              ? selectedInvoice
                ? `Convert using ${selectedInvoice.number}`
                : 'Convert using invoice'
              : 'Convert & record payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ModeOption({
  checked,
  onSelect,
  label,
  hint,
}: {
  checked: boolean;
  onSelect: () => void;
  label: string;
  hint: string;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm transition-colors hover:bg-muted/50',
        checked && 'border-primary ring-1 ring-primary/40',
      )}
    >
      <input
        type="radio"
        name="convert-mode"
        checked={checked}
        onChange={onSelect}
        className="mt-1"
      />
      <span>
        <span className="block font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
}

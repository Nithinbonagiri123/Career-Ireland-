'use client';

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { todayInDublin } from '@/lib/dates';
import type { InvoiceableService } from '@/modules/billing/read';
import { directPaymentAndConvertAction } from '@/modules/clients/direct-payment';

/**
 * Stage 6E Section 3 — Direct Payment & Convert dialog.
 *
 * One form. No verify step. No finance-approval checkbox. On submit a
 * single server transaction records the completed payment, issues the
 * official invoice + receipt (with the real INV / RCT numbers), and
 * activates the candidate.
 *
 * - Payment date defaults to today in Europe/Dublin (not the browser's
 *   timezone — see `src/lib/dates.ts`).
 * - Reference is optional. If blank, the server omits the field entirely
 *   from invoice + receipt. No reference is required for CASH.
 * - Full payment only. Partial amounts are redirected to the quote flow
 *   with a specific error code the UI surfaces as a hint.
 * - Idempotency key seeded per dialog mount — a double-click returns
 *   the same (invoiceNumber, receiptNumber) rather than duplicating.
 */
export function DirectPaymentDialog({
  lead,
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
  services: InvoiceableService[];
  defaultCurrencyCode: string;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serviceId, setServiceId] = useState<string>(services[0]?.id ?? '');
  const [packageId, setPackageId] = useState<string>('');
  const [agreedAmount, setAgreedAmount] = useState<string>('');
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  const [currency, setCurrency] = useState<string>(defaultCurrencyCode);
  const [method, setMethod] = useState<'CASH' | 'BANK_TRANSFER' | 'CARD'>('BANK_TRANSFER');
  const [paymentDate, setPaymentDate] = useState<string>(() => todayInDublin());
  const [reference, setReference] = useState<string>('');
  const [overrideReason, setOverrideReason] = useState<string>('');
  const [showOverride, setShowOverride] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const service = useMemo(() => services.find((s) => s.id === serviceId), [services, serviceId]);
  const dialogSeed = useId();
  // Fresh idempotency key per dialog mount; a reopen gets a new one.
  const idempotencyKey = useMemo(
    () => `dp-${dialogSeed}-${open ? Date.now() : ''}`,
    [dialogSeed, open],
  );

  // Prefill agreed + payment + currency from the first package of the
  // selected service, so the common "pay sticker price" case is one
  // click + confirm.
  useEffect(() => {
    if (!service) return;
    const pkg = service.packages[0];
    if (pkg) {
      setPackageId(pkg.id);
      setAgreedAmount(pkg.price);
      setPaymentAmount(pkg.price);
      setCurrency(pkg.currencyCode);
    }
  }, [service]);

  function reset() {
    setServiceId(services[0]?.id ?? '');
    setPackageId('');
    setAgreedAmount('');
    setPaymentAmount('');
    setCurrency(defaultCurrencyCode);
    setMethod('BANK_TRANSFER');
    setPaymentDate(todayInDublin());
    setReference('');
    setOverrideReason('');
    setShowOverride(false);
    setError(null);
  }

  function submit() {
    setError(null);
    if (!service) {
      setError('Pick a service first.');
      return;
    }
    if (!lead.personId) {
      setError('This lead has no person attached.');
      return;
    }
    const trimmedRef = reference.trim();
    startTransition(async () => {
      const r = await directPaymentAndConvertAction({
        leadId: lead.id,
        serviceCatalogItemId: service.id,
        agreedAmount,
        paymentAmount,
        currencyCode: currency,
        methodDisplay: method,
        paymentDate,
        reference: trimmedRef || null,
        idempotencyKey,
        overrideDuplicateReason: showOverride ? overrideReason.trim() || null : null,
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
        // Navigate to the workspace so the operator sees the result.
        router.push(`/clients/${r.data.personId}?tab=billing`);
        router.refresh();
      } else {
        // Specific error codes we handle inline so the operator doesn't
        // have to decode a toast + retry.
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

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Direct Payment & Convert</DialogTitle>
          <DialogDescription>
            Use this when {lead.displayName} has already paid. One submit records the completed
            payment, issues the official invoice + receipt, and activates the candidate — all in one
            step. For partial payments use a quote instead.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="dp-svc">Service</Label>
            <Select
              id="dp-svc"
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              disabled={pending}
            >
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>

          {service && service.packages.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="dp-pkg">
                Package <span className="text-xs text-muted-foreground">(optional prefill)</span>
              </Label>
              <Select
                id="dp-pkg"
                value={packageId}
                onChange={(e) => {
                  setPackageId(e.target.value);
                  const pkg = service.packages.find((p) => p.id === e.target.value);
                  if (pkg) {
                    setAgreedAmount(pkg.price);
                    setPaymentAmount(pkg.price);
                    setCurrency(pkg.currencyCode);
                  }
                }}
                disabled={pending}
              >
                <option value="">— custom price —</option>
                {service.packages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.currencyCode} {p.price} · {p.name}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="dp-agreed">Agreed amount</Label>
              <Input
                id="dp-agreed"
                inputMode="decimal"
                value={agreedAmount}
                onChange={(e) => setAgreedAmount(e.target.value)}
                disabled={pending}
                placeholder="e.g. 100.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dp-paid">Payment amount</Label>
              <Input
                id="dp-paid"
                inputMode="decimal"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                disabled={pending}
                placeholder="Must match agreed in full"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="dp-cur">Currency</Label>
              <Input
                id="dp-cur"
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                disabled={pending}
                maxLength={3}
                placeholder="EUR"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dp-method">Method</Label>
              <Select
                id="dp-method"
                value={method}
                onChange={(e) => setMethod(e.target.value as 'CASH' | 'BANK_TRANSFER' | 'CARD')}
                disabled={pending}
              >
                <option value="CASH">Cash</option>
                <option value="BANK_TRANSFER">Bank transfer</option>
                <option value="CARD">Card</option>
              </Select>
            </div>
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
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dp-ref">
              Payment reference{' '}
              <span className="text-xs text-muted-foreground">
                (optional; not required for cash)
              </span>
            </Label>
            <Input
              id="dp-ref"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              disabled={pending}
              maxLength={500}
              placeholder="Bank line / card transaction id / cash slip"
            />
          </div>

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
        <DialogFooter>
          <DialogClose render={<Button variant="outline" type="button" disabled={pending} />}>
            Cancel
          </DialogClose>
          <Button type="button" onClick={submit} disabled={pending || !lead.personId}>
            {pending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Record payment & convert
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

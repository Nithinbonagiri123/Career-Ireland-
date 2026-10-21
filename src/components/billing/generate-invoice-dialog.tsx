'use client';

import { FileText, Loader2 } from 'lucide-react';
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
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { formatCurrency } from '@/lib/currency';
import { generateInvoiceAction } from '@/modules/billing/generate-actions';
import type { InvoiceableService } from '@/modules/billing/read';

/**
 * Shared "Generate invoice" dialog. Reused from:
 *   - the lead-row menu for adding an *extra* invoice to an existing lead
 *     (the primary invoice is issued at lead creation).
 *   - the employer detail page.
 *
 * All fields are always editable. Picking a package pre-fills the unit
 * price and currency; the operator can override either at any time —
 * for discounts, waivers, or negotiated pricing. Amount lockdown is
 * NOT a feature.
 *
 *   - Service      → dropdown (services matching payerType)
 *   - Package      → dropdown (optional; only prefills)
 *   - QTY          → integer, defaults to 1
 *   - Unit price   → decimal string, always editable
 *   - Currency     → EUR / ZAR, always editable
 *   - Description  → optional line override, falls back to service name
 */
export function GenerateInvoiceDialog({
  payerMode,
  payerId,
  payerLabel,
  services,
  triggerLabel = 'Generate invoice',
  triggerVariant = 'default',
  open: externalOpen,
  onOpenChange: externalOnOpenChange,
  contextLinks,
  defaultOpen,
}: {
  payerMode: 'PERSON' | 'EMPLOYER';
  payerId: string;
  payerLabel: string;
  services: InvoiceableService[];
  triggerLabel?: string;
  triggerVariant?: 'default' | 'outline' | 'secondary';
  open?: boolean;
  onOpenChange?: (next: boolean) => void;
  /** Optional back-links baked onto the generated invoice so the case /
   *  requisition / placement detail pages can find it by FK rather than
   *  by heuristic. Set by the caller when this dialog is opened from a
   *  specific case or placement context. */
  contextLinks?: {
    immigrationCaseId?: string;
    jobRequisitionId?: string;
    placementId?: string;
  };
  /** Pop the dialog on mount — used when a page is deep-linked with a
   *  ?raisePlacement=… query param so the operator lands directly in
   *  the invoice form instead of an extra button click. One-shot. */
  defaultOpen?: boolean;
}) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = externalOpen !== undefined && externalOnOpenChange !== undefined;
  const open = isControlled ? externalOpen : internalOpen;
  const setOpen = isControlled ? externalOnOpenChange : setInternalOpen;

  // Deep-link auto-open — fires once on first render. If the caller
  // also switches controlled mode later the effect won't re-fire and
  // won't overwrite external state.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally one-shot mount
  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, []);

  const [serviceId, setServiceId] = useState<string>(services[0]?.id ?? '');
  const [packageId, setPackageId] = useState<string>('');
  const [qty, setQty] = useState<string>('1');
  const [unitPrice, setUnitPrice] = useState<string>('');
  const [currency, setCurrency] = useState<string>('EUR');
  const [lineDescription, setLineDescription] = useState<string>('');
  const [pending, startTransition] = useTransition();
  // Stage B Wave 1 — inline duplicate warning + audited override, plus a
  // per-open idempotency key so a double-click or retry can't raise a
  // second engagement + invoice.
  const [error, setError] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [showOverride, setShowOverride] = useState(false);
  const idSeed = useId();
  const idempotencyKey = useMemo(() => `gi-${idSeed}-${open ? Date.now() : ''}`, [idSeed, open]);

  const service = useMemo(() => services.find((s) => s.id === serviceId), [services, serviceId]);

  const onServiceChange = (nextId: string) => {
    setServiceId(nextId);
    setPackageId('');
    setUnitPrice('');
    setCurrency('EUR');
    setLineDescription('');
  };

  const onPackageChange = (pkgId: string) => {
    setPackageId(pkgId);
    const pkg = service?.packages.find((p) => p.id === pkgId);
    if (pkg) {
      // Prefill only — operator can override afterwards.
      setUnitPrice(pkg.price);
      setCurrency(pkg.currencyCode);
    }
  };

  const canSubmit = useMemo(() => {
    if (!service) return false;
    const qtyNum = Number.parseInt(qty, 10);
    if (!Number.isInteger(qtyNum) || qtyNum <= 0) return false;
    if (!/^\d+(\.\d{1,2})?$/.test(unitPrice)) return false;
    if (Number.parseFloat(unitPrice) < 0) return false;
    if (!/^[A-Z]{3}$/.test(currency)) return false;
    return true;
  }, [service, qty, unitPrice, currency]);

  const onSubmit = () => {
    if (!service || !canSubmit) return;
    setError(null);
    startTransition(async () => {
      const r = await generateInvoiceAction({
        payerMode,
        payerId,
        serviceCatalogItemId: service.id,
        servicePackageId: packageId || null,
        qty: Number.parseInt(qty, 10),
        unitPrice,
        currencyCode: currency,
        lineDescription: lineDescription.trim() || null,
        immigrationCaseId: contextLinks?.immigrationCaseId ?? null,
        jobRequisitionId: contextLinks?.jobRequisitionId ?? null,
        placementId: contextLinks?.placementId ?? null,
        idempotencyKey,
        overrideDuplicateReason: showOverride ? overrideReason.trim() || null : null,
      });
      if (!r.ok) {
        const code = (r.error as { code?: string }).code;
        if (code === 'DUPLICATE_INVOICE_LIKELY') {
          // Keep the dialog open and reveal the audited override path
          // instead of a vanishing toast.
          setShowOverride(true);
          setError(r.error.message);
          return;
        }
        setError(r.error.message);
        toast.error(r.error.message);
        return;
      }
      toast.success(`Invoice ${r.data.invoiceNumber} issued`);
      setOpen(false);
      setError(null);
      setOverrideReason('');
      setShowOverride(false);
      router.push(r.data.printPath);
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!isControlled && (
        <DialogTrigger
          render={
            <Button variant={triggerVariant} size="sm">
              <FileText className="mr-1.5 size-4" />
              {triggerLabel}
            </Button>
          }
        />
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate invoice</DialogTitle>
          <DialogDescription>
            Invoice for <span className="font-medium text-foreground">{payerLabel}</span>. Pick a
            service; QTY, unit price and currency default from the package (if any) but you can edit
            them freely. A fresh <span className="font-mono">INV-YYYY-NNNNNN</span> is allocated on
            save.
          </DialogDescription>
        </DialogHeader>

        {services.length === 0 ? (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            No active {payerMode.toLowerCase()} services in the catalog.{' '}
            <a href="/admin/services" className="underline">
              Add one in /admin/services
            </a>{' '}
            first.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="svc" className="text-xs font-medium">
                Service
              </Label>
              <Select id="svc" value={serviceId} onChange={(e) => onServiceChange(e.target.value)}>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>

            {(service?.packages.length ?? 0) > 0 && (
              <div className="space-y-1.5">
                <Label htmlFor="pkg" className="text-xs font-medium">
                  Prefill from package (optional)
                </Label>
                <Select
                  id="pkg"
                  value={packageId}
                  onChange={(e) => onPackageChange(e.target.value)}
                >
                  <option value="">— none, enter unit price manually —</option>
                  {service?.packages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.currencyCode} · {formatCurrency(p.price, p.currencyCode)} · {p.name}
                    </option>
                  ))}
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Prefills the fields below. You can still override any of them.
                </p>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="qty" className="text-xs font-medium">
                  QTY
                </Label>
                <Input
                  id="qty"
                  inputMode="numeric"
                  value={qty}
                  onChange={(e) => setQty(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="1"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="unitPrice" className="text-xs font-medium">
                  Unit price
                </Label>
                <Input
                  id="unitPrice"
                  inputMode="decimal"
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(e.target.value)}
                  placeholder="e.g. 100.00"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="currency" className="text-xs font-medium">
                  Currency
                </Label>
                <Select
                  id="currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                >
                  <option value="EUR">EUR</option>
                  <option value="ZAR">ZAR</option>
                </Select>
              </div>
              <div className="col-span-3 text-[11px] text-muted-foreground">
                Total = QTY × Unit price. VAT is added on top per the rate set in{' '}
                <a href="/admin/settings" className="underline">
                  /admin/settings
                </a>{' '}
                (0% = no VAT row on the printable).
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="descr" className="text-xs font-medium">
                Line description (optional)
              </Label>
              <Input
                id="descr"
                value={lineDescription}
                onChange={(e) => setLineDescription(e.target.value)}
                placeholder={service?.name ?? 'e.g. CV & Cover Letter'}
              />
              <p className="text-[11px] text-muted-foreground">
                Shows in the invoice line. Leave blank to use the service name.
              </p>
            </div>
          </div>
        )}

        {showOverride && (
          <div className="space-y-1.5 rounded-md border border-amber-400/40 bg-amber-50 p-3 text-xs dark:bg-amber-900/30">
            <label htmlFor="gi-override" className="font-medium text-amber-900 dark:text-amber-100">
              Reason for proceeding despite a possible duplicate
            </label>
            <textarea
              id="gi-override"
              rows={2}
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              disabled={pending}
              maxLength={500}
              className="w-full rounded-md border border-input bg-background px-2 py-1.5"
            />
          </div>
        )}
        {error && (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        )}

        <DialogFooter>
          <DialogClose render={<Button variant="outline" size="sm" disabled={pending} />} />
          <Button
            size="sm"
            onClick={onSubmit}
            disabled={pending || !canSubmit || (showOverride && overrideReason.trim().length < 3)}
          >
            {pending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
            Generate invoice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

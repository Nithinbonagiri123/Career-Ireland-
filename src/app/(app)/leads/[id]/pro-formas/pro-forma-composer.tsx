'use client';

import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { formatCurrency } from '@/lib/currency';
import type { InvoiceableService } from '@/modules/billing/read';
import {
  createProFormaAction,
  editDraftProFormaAction,
  reviseIssuedProFormaAction,
} from '@/modules/proformas/actions';

/**
 * Pro-forma composer dialog. Three modes:
 *   - create: new DRAFT against a lead
 *   - edit:   mutate an existing DRAFT in place (no revision bump)
 *   - revise: mutate an ISSUED pro forma, snapshotting the previous
 *             state into pro_forma_revisions and bumping revision
 *
 * The subtotal shown here is a client-side preview. The server
 * recomputes everything from the raw quantity × unit_price inputs when
 * it writes — the printable and the DB row always agree with that
 * recomputation, not with what the browser sent.
 */

type Mode = 'create' | 'edit' | 'revise';

type Line = {
  id: string;
  serviceCatalogItemId: string;
  description: string;
  quantity: string;
  unitPrice: string;
};

function uid(): string {
  return `l-${Math.random().toString(36).slice(2, 10)}`;
}

function parseLine(line: Line) {
  const q = Number.parseFloat(line.quantity);
  const u = Number.parseFloat(line.unitPrice);
  if (!Number.isFinite(q) || q <= 0) return { ok: false, subtotal: 0 } as const;
  if (!Number.isFinite(u) || u < 0) return { ok: false, subtotal: 0 } as const;
  // Mirror the server's rounding behaviour: compute in cents.
  const centsPerUnit = Math.round(u * 100);
  const milli = Math.round(q * 1000);
  const cents = Math.round((centsPerUnit * milli) / 1000);
  return { ok: true, subtotal: cents / 100 } as const;
}

export function ProFormaComposer({
  mode,
  leadId,
  services,
  currencies,
  proFormaInvoiceId,
  initial,
  triggerLabel,
  triggerVariant = 'default',
  existingProposalGroupId,
}: {
  mode: Mode;
  leadId: string;
  services: InvoiceableService[];
  currencies: Array<{ code: string; name: string; symbol: string }>;
  proFormaInvoiceId?: string;
  initial?: {
    currencyCode: string;
    paymentTerms: string | null;
    notes: string | null;
    lines: Array<{
      serviceCatalogItemId: string;
      description: string;
      quantity: string;
      unitPrice: string;
    }>;
  };
  triggerLabel: string;
  triggerVariant?: 'default' | 'outline' | 'secondary';
  /** When set in `create` mode, places the new pro forma in the same
   *  proposal group as the current one so accepting one supersedes the
   *  siblings. Omit for a standalone offer. */
  existingProposalGroupId?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const [currency, setCurrency] = useState(initial?.currencyCode ?? 'EUR');
  const [paymentTerms, setPaymentTerms] = useState(initial?.paymentTerms ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState<Line[]>(() => {
    if (initial?.lines?.length) {
      return initial.lines.map((l) => ({ id: uid(), ...l }));
    }
    return [
      {
        id: uid(),
        serviceCatalogItemId: services[0]?.id ?? '',
        description: services[0]?.name ?? '',
        quantity: '1',
        unitPrice: services[0]?.packages[0]?.price ?? '',
      },
    ];
  });

  const totals = useMemo(() => {
    let sum = 0;
    for (const l of lines) {
      const r = parseLine(l);
      if (r.ok) sum += r.subtotal;
    }
    return { subtotal: sum };
  }, [lines]);

  function addLine() {
    const first = services[0];
    setLines((prev) => [
      ...prev,
      {
        id: uid(),
        serviceCatalogItemId: first?.id ?? '',
        description: first?.name ?? '',
        quantity: '1',
        unitPrice: first?.packages[0]?.price ?? '',
      },
    ]);
  }

  function removeLine(id: string) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.id !== id)));
  }

  function updateLine(id: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  function onPickService(id: string, serviceCatalogItemId: string) {
    const svc = services.find((s) => s.id === serviceCatalogItemId);
    if (!svc) return;
    const pack = svc.packages[0];
    updateLine(id, {
      serviceCatalogItemId,
      description: svc.name,
      unitPrice: pack?.price ?? '',
    });
    if (pack?.currencyCode) setCurrency(pack.currencyCode);
  }

  function submit() {
    if (lines.length === 0) {
      toast.error('Add at least one line');
      return;
    }
    for (const l of lines) {
      if (!l.serviceCatalogItemId) {
        toast.error('Every line needs a service');
        return;
      }
      if (!l.description.trim()) {
        toast.error('Every line needs a description');
        return;
      }
      const r = parseLine(l);
      if (!r.ok) {
        toast.error('Every line needs a positive quantity and a non-negative price');
        return;
      }
    }
    if (mode === 'revise' && reason.trim().length < 3) {
      toast.error('Please note what changed (min 3 characters)');
      return;
    }

    const payloadLines = lines.map((l) => ({
      serviceCatalogItemId: l.serviceCatalogItemId,
      description: l.description.trim(),
      quantity: l.quantity.trim(),
      unitPrice: l.unitPrice.trim(),
    }));

    startTransition(async () => {
      let result: Awaited<ReturnType<typeof createProFormaAction>>;
      if (mode === 'create') {
        result = await createProFormaAction({
          sourceLeadId: leadId,
          proposalGroupId: existingProposalGroupId ?? undefined,
          currencyCode: currency,
          paymentTerms: paymentTerms || undefined,
          notes: notes || undefined,
          lines: payloadLines,
        });
      } else if (mode === 'edit') {
        if (!proFormaInvoiceId) {
          toast.error('Missing pro forma id');
          return;
        }
        result = await editDraftProFormaAction({
          proFormaInvoiceId,
          currencyCode: currency,
          paymentTerms: paymentTerms || undefined,
          notes: notes || undefined,
          lines: payloadLines,
        });
      } else {
        if (!proFormaInvoiceId) {
          toast.error('Missing pro forma id');
          return;
        }
        result = await reviseIssuedProFormaAction({
          proFormaInvoiceId,
          reason: reason.trim(),
          currencyCode: currency,
          paymentTerms: paymentTerms || undefined,
          notes: notes || undefined,
          lines: payloadLines,
        });
      }
      if (result.ok) {
        toast.success(
          mode === 'create'
            ? 'Pro forma draft created'
            : mode === 'edit'
              ? 'Draft updated'
              : 'Revision saved',
        );
        setOpen(false);
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  const title =
    mode === 'create'
      ? existingProposalGroupId
        ? 'Add alternative pro forma'
        : 'Create pro forma'
      : mode === 'edit'
        ? 'Edit draft pro forma'
        : 'Revise issued pro forma';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant={triggerVariant} size="sm">
            {triggerLabel}
          </Button>
        }
      />
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {mode === 'revise'
              ? "Snapshots the current issued version into revision history, then applies your changes. Won't touch accepted agreements."
              : 'All lines share one currency. The server recomputes totals from quantity × unit price.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="pf-currency">Currency</Label>
              <Select
                id="pf-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                {currencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="pf-terms">Payment terms (optional)</Label>
              <Input
                id="pf-terms"
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                placeholder="e.g. 50% deposit, balance on acceptance"
                maxLength={500}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Line items</Label>
              <Button variant="outline" size="sm" type="button" onClick={addLine}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Add line
              </Button>
            </div>
            <div className="space-y-2">
              {lines.map((l, _idx) => {
                const linePreview = parseLine(l);
                return (
                  <div
                    key={l.id}
                    className="rounded-md border p-3 grid grid-cols-12 gap-2 items-end"
                  >
                    <div className="col-span-12 sm:col-span-5">
                      <Label className="text-xs">Service</Label>
                      <Select
                        value={l.serviceCatalogItemId}
                        onChange={(e) => onPickService(l.id, e.target.value)}
                      >
                        {services.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="col-span-6 sm:col-span-2">
                      <Label className="text-xs">Qty</Label>
                      <Input
                        inputMode="decimal"
                        value={l.quantity}
                        onChange={(e) => updateLine(l.id, { quantity: e.target.value })}
                      />
                    </div>
                    <div className="col-span-6 sm:col-span-2">
                      <Label className="text-xs">Unit price</Label>
                      <Input
                        inputMode="decimal"
                        value={l.unitPrice}
                        onChange={(e) => updateLine(l.id, { unitPrice: e.target.value })}
                      />
                    </div>
                    <div className="col-span-10 sm:col-span-2 text-right text-sm tabular-nums">
                      <div className="text-xs text-muted-foreground">Subtotal</div>
                      <div className={linePreview.ok ? '' : 'text-destructive'}>
                        {linePreview.ok ? formatCurrency(linePreview.subtotal, currency) : '—'}
                      </div>
                    </div>
                    <div className="col-span-2 sm:col-span-1 flex justify-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        type="button"
                        onClick={() => removeLine(l.id)}
                        disabled={lines.length === 1}
                        title="Remove line"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="col-span-12">
                      <Label className="text-xs">Description</Label>
                      <Input
                        value={l.description}
                        onChange={(e) => updateLine(l.id, { description: e.target.value })}
                        maxLength={500}
                        placeholder="Appears on the PDF line"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-start justify-between gap-4 rounded-md border bg-muted/30 p-3">
            <div className="flex-1">
              <Label htmlFor="pf-notes" className="text-xs">
                Internal notes (optional)
              </Label>
              <Textarea
                id="pf-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                maxLength={2000}
                placeholder="Not shown on the PDF"
              />
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Document total</div>
              <div className="text-2xl font-semibold tabular-nums">
                {formatCurrency(totals.subtotal, currency)}
              </div>
            </div>
          </div>

          {mode === 'revise' && (
            <div>
              <Label htmlFor="pf-reason">Reason for revision</Label>
              <Input
                id="pf-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. updated line 2 to reflect agreed discount"
                maxLength={500}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" type="button" disabled={pending} />}>
            Cancel
          </DialogClose>
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {mode === 'create' ? 'Save draft' : mode === 'edit' ? 'Save' : 'Save revision'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

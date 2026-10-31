'use client';

import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useMemo, useState, useTransition } from 'react';
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
  const baseId = useId();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  // Inline copy of the last validation / server error (the toast still
  // fires too) so the message stays next to the form while it's fixed.
  const [formError, setFormError] = useState<string | null>(null);

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

  function fail(message: string) {
    setFormError(message);
    toast.error(message);
  }

  function submit() {
    setFormError(null);
    if (lines.length === 0) {
      fail('Add at least one line');
      return;
    }
    for (const l of lines) {
      if (!l.serviceCatalogItemId) {
        fail('Every line needs a service');
        return;
      }
      if (!l.description.trim()) {
        fail('Every line needs a description');
        return;
      }
      const r = parseLine(l);
      if (!r.ok) {
        fail('Every line needs a positive quantity and a non-negative price');
        return;
      }
    }
    if (mode === 'revise' && reason.trim().length < 3) {
      fail('Please note what changed (min 3 characters)');
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
          fail('Missing pro forma id');
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
          fail('Missing pro forma id');
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
        fail(result.error.message);
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
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setFormError(null);
      }}
    >
      <DialogTrigger
        render={
          <Button variant={triggerVariant} size="sm">
            {triggerLabel}
          </Button>
        }
      />
      {/* Stage 6F Phase 3 — widened to max-w-3xl so multi-line
          service rows (qty / price / description) have room without
          wrapping, with max-h scrolling for short viewports. */}
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {mode === 'revise'
              ? "Snapshots the current issued version into revision history, then applies your changes. Won't touch accepted agreements."
              : 'All lines share one currency. The server recomputes the total from quantity × unit price.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1.5fr]">
            <div className="space-y-1.5">
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
            <div className="space-y-1.5">
              <Label htmlFor="pf-terms">
                Payment terms <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="pf-terms"
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                placeholder="e.g. 50% deposit, balance on acceptance"
                maxLength={500}
              />
            </div>
          </div>

          <fieldset className="min-w-0 space-y-2.5">
            <legend className="sr-only">Line items</legend>
            <div className="flex items-center justify-between">
              <span aria-hidden className="text-sm font-medium">
                Line items
              </span>
              <Button variant="ghost" size="sm" type="button" onClick={addLine}>
                <Plus className="mr-1 h-3.5 w-3.5" aria-hidden /> Add line
              </Button>
            </div>
            <div className="space-y-2">
              {lines.map((l, index) => {
                const linePreview = parseLine(l);
                const canRemove = lines.length > 1;
                const fid = `${baseId}-${l.id}`;
                const n = index + 1;
                return (
                  <div
                    key={l.id}
                    className="space-y-3 rounded-xl border border-border/60 bg-card p-3.5"
                  >
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <Label htmlFor={`${fid}-service`} className="text-xs text-muted-foreground">
                          Service <span className="sr-only">(line {n})</span>
                        </Label>
                        <Select
                          id={`${fid}-service`}
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
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        type="button"
                        onClick={() => removeLine(l.id)}
                        disabled={!canRemove}
                        aria-label={`Remove line ${n}`}
                        title={canRemove ? 'Remove line' : 'A pro forma needs at least one line'}
                        className="mt-6 shrink-0 text-muted-foreground hover:text-destructive disabled:opacity-30"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 items-end gap-x-3 gap-y-2 sm:grid-cols-[auto_auto_1fr]">
                      <div className="min-w-0 space-y-1.5">
                        <Label htmlFor={`${fid}-qty`} className="text-xs text-muted-foreground">
                          Qty <span className="sr-only">(line {n})</span>
                        </Label>
                        <Input
                          id={`${fid}-qty`}
                          inputMode="decimal"
                          value={l.quantity}
                          aria-invalid={!linePreview.ok || undefined}
                          onChange={(e) => updateLine(l.id, { quantity: e.target.value })}
                          className="w-full text-right tabular-nums sm:w-20"
                        />
                      </div>
                      <div className="min-w-0 space-y-1.5">
                        <Label htmlFor={`${fid}-price`} className="text-xs text-muted-foreground">
                          Unit price <span className="sr-only">(line {n})</span>
                        </Label>
                        <Input
                          id={`${fid}-price`}
                          inputMode="decimal"
                          value={l.unitPrice}
                          aria-invalid={!linePreview.ok || undefined}
                          onChange={(e) => updateLine(l.id, { unitPrice: e.target.value })}
                          className="w-full text-right tabular-nums sm:w-28"
                        />
                      </div>
                      <div className="col-span-2 flex items-baseline justify-between gap-2 sm:col-span-1 sm:block sm:text-right">
                        <div className="text-xs font-medium text-muted-foreground">Subtotal</div>
                        <div
                          className={`text-base font-semibold tabular-nums ${linePreview.ok ? '' : 'text-destructive'}`}
                        >
                          {linePreview.ok ? formatCurrency(linePreview.subtotal, currency) : '—'}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor={`${fid}-desc`} className="text-xs text-muted-foreground">
                        Description <span className="text-muted-foreground/70">(on the PDF)</span>
                        <span className="sr-only"> (line {n})</span>
                      </Label>
                      <Input
                        id={`${fid}-desc`}
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
          </fieldset>

          <div className="flex flex-col gap-4 border-t pt-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Label htmlFor="pf-notes" className="text-xs text-muted-foreground">
                Internal notes <span className="text-muted-foreground/70">(not on the PDF)</span>
              </Label>
              <Textarea
                id="pf-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                maxLength={2000}
                placeholder="Context for the team — not shown on the PDF"
              />
            </div>
            <div className="flex shrink-0 items-baseline justify-between gap-3 sm:block sm:text-right">
              <div className="text-xs font-medium text-muted-foreground">Document total</div>
              <div className="text-2xl font-semibold tabular-nums">
                {formatCurrency(totals.subtotal, currency)}
              </div>
            </div>
          </div>

          {mode === 'revise' && (
            <div className="space-y-1.5">
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
          {formError && (
            <p
              role="alert"
              className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {formError}
            </p>
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

'use client';

import { addDays, format } from 'date-fns';
import {
  Calculator,
  Check,
  Info,
  ListChecks,
  Minus,
  Plus,
  Settings2,
  Trash2,
  User,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { formatCurrency } from '@/lib/currency';
import { cn } from '@/lib/utils';
import type { InvoiceableService } from '@/modules/billing/read';
import { createProFormaAction, issueProFormaAction } from '@/modules/proformas/actions';

/**
 * Stage 6G Screen 08 — dedicated Create Pro Forma page body. Service
 * rows come from the catalogue (preselectable via ?services=…); the
 * server recomputes every total from quantity × unit price, so the
 * summary here is display-only arithmetic over the same inputs.
 *
 * "Save Draft" creates a DRAFT quote; "Create Pro Forma" creates it
 * and issues it in one step (number + issue timestamp are stamped
 * server-side at issue time). Print/PDF exist only once the document
 * exists, so those buttons explain themselves until then.
 */

type LineRow = {
  key: string;
  serviceCatalogItemId: string;
  name: string;
  description: string;
  unitPrice: string;
  quantity: number;
  included: boolean;
};

const TERM_PRESETS = ['Due on receipt', '7 days', '14 days', '30 days'] as const;

function defaultPriceFor(s: InvoiceableService, currency: string): string {
  const pkg = s.packages.find((p) => p.currencyCode === currency) ?? s.packages[0];
  if (pkg) return pkg.price;
  if (s.defaultPrice) return s.defaultPrice;
  return '';
}

export function CreateProFormaForm({
  personId,
  leadId,
  person,
  services,
  currencies,
  preselectedIds,
}: {
  personId: string;
  leadId: string;
  person: {
    name: string;
    email: string | null;
    phone: string | null;
    nationality: string | null;
    location: string | null;
  };
  services: InvoiceableService[];
  currencies: Array<{ code: string; name: string; symbol: string }>;
  preselectedIds: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [currency, setCurrency] = useState('EUR');
  const [terms, setTerms] = useState<string>('14 days');
  const [customTerms, setCustomTerms] = useState('');
  const [expiry, setExpiry] = useState(() => format(addDays(new Date(), 14), 'yyyy-MM-dd'));
  const today = useMemo(() => new Date(), []);

  const [rows, setRows] = useState<LineRow[]>(() => {
    const preset = new Set(preselectedIds);
    // Preselected services first, then the rest of the catalogue as
    // unticked suggestions (mockup shows the full pickable list).
    const ordered = [...services].sort((a, b) => {
      const ap = preset.has(a.id) ? 0 : 1;
      const bp = preset.has(b.id) ? 0 : 1;
      return ap - bp || a.name.localeCompare(b.name);
    });
    return ordered.slice(0, Math.max(6, preset.size)).map((s, i) => ({
      key: `cat-${s.id}`,
      serviceCatalogItemId: s.id,
      name: s.name,
      description: s.description ?? s.name,
      unitPrice: defaultPriceFor(s, 'EUR'),
      quantity: preset.size > 0 ? (preset.has(s.id) ? 1 : 0) : i === 0 ? 1 : 0,
      included: preset.size > 0 ? preset.has(s.id) : i === 0,
    }));
  });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerId, setPickerId] = useState('');

  const includedRows = rows.filter(
    (r) => r.included && r.quantity > 0 && Number.parseFloat(r.unitPrice || '0') >= 0,
  );
  const subtotalCents = includedRows.reduce(
    (acc, r) => acc + Math.round(Number.parseFloat(r.unitPrice || '0') * 100) * r.quantity,
    0,
  );
  const subtotal = (subtotalCents / 100).toFixed(2);

  const patchRow = (key: string, patch: Partial<LineRow>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const addService = () => {
    const svc = services.find((s) => s.id === pickerId);
    if (!svc) return;
    setRows((prev) => [
      ...prev,
      {
        key: `add-${svc.id}-${prev.length}`,
        serviceCatalogItemId: svc.id,
        name: svc.name,
        description: svc.description ?? svc.name,
        unitPrice: defaultPriceFor(svc, currency),
        quantity: 1,
        included: true,
      },
    ]);
    setPickerOpen(false);
    setPickerId('');
  };

  const paymentTerms = () => {
    const base = terms === 'custom' ? customTerms.trim() : terms;
    const until = expiry ? ` · valid until ${format(new Date(expiry), 'dd MMM yyyy')}` : '';
    return `${base}${until}`.trim();
  };

  const submit = (issueAfterCreate: boolean) => {
    const lines = includedRows.map((r) => ({
      serviceCatalogItemId: r.serviceCatalogItemId,
      description: r.description.trim() || r.name,
      quantity: String(r.quantity),
      unitPrice: Number.parseFloat(r.unitPrice || '0').toFixed(2),
    }));
    if (lines.length === 0) {
      toast.error('Select at least one service with a quantity above zero.');
      return;
    }
    if (lines.some((l) => !(Number.parseFloat(l.unitPrice) > 0))) {
      toast.error('Every selected service needs a unit price above zero.');
      return;
    }
    startTransition(async () => {
      const created = await createProFormaAction({
        sourceLeadId: leadId,
        currencyCode: currency,
        paymentTerms: paymentTerms(),
        notes: '',
        lines,
      });
      if (!created.ok) {
        toast.error(created.error.message);
        return;
      }
      if (issueAfterCreate) {
        const issued = await issueProFormaAction({ proFormaInvoiceId: created.data.id });
        if (!issued.ok) {
          toast.error(`Draft saved, but issuing failed: ${issued.error.message}`);
          router.push(`/clients/${personId}?tab=services-billing`);
          return;
        }
        toast.success(`Pro forma ${issued.data.number} issued`);
      } else {
        toast.success('Draft pro forma saved');
      }
      router.push(`/clients/${personId}?tab=services-billing`);
      router.refresh();
    });
  };

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-5">
        {/* ── Invoice details ──────────────────────────────────── */}
        <section className="rounded-xl border bg-card shadow-sm ring-1 ring-border/60">
          <div className="flex items-center gap-2.5 border-b px-4 py-3 sm:px-5">
            <span
              aria-hidden
              className="grid size-7 place-items-center rounded-md bg-sky-100 text-sky-700"
            >
              <Settings2 className="size-4" />
            </span>
            <h2 className="text-sm font-semibold text-foreground">Invoice Details</h2>
          </div>
          <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-4">
            <div className="space-y-1">
              <label htmlFor="pf-date" className="text-xs font-medium text-foreground/80">
                Invoice date
              </label>
              <Input
                id="pf-date"
                value={format(today, 'dd MMM yyyy')}
                readOnly
                className="cursor-not-allowed bg-muted/40 text-sm"
                title="Stamped automatically when the pro forma is issued"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="pf-expiry" className="text-xs font-medium text-foreground/80">
                Expiry date
              </label>
              <Input
                id="pf-expiry"
                type="date"
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
                className="text-sm"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="pf-terms" className="text-xs font-medium text-foreground/80">
                Payment terms
              </label>
              <Select
                id="pf-terms"
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
                className="text-sm"
              >
                {TERM_PRESETS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
                <option value="custom">Custom…</option>
              </Select>
              {terms === 'custom' && (
                <Input
                  aria-label="Custom payment terms"
                  value={customTerms}
                  onChange={(e) => setCustomTerms(e.target.value)}
                  placeholder="e.g. 50% deposit, balance on acceptance"
                  className="mt-1.5 text-sm"
                />
              )}
            </div>
            <div className="space-y-1">
              <label htmlFor="pf-currency" className="text-xs font-medium text-foreground/80">
                Currency
              </label>
              <Select
                id="pf-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="text-sm"
              >
                {currencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} ({c.symbol})
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </section>

        {/* ── Services ─────────────────────────────────────────── */}
        <section className="rounded-xl border bg-card shadow-sm ring-1 ring-border/60">
          <div className="flex items-center gap-2.5 border-b px-4 py-3 sm:px-5">
            <span
              aria-hidden
              className="grid size-7 place-items-center rounded-md bg-violet-100 text-violet-700"
            >
              <ListChecks className="size-4" />
            </span>
            <h2 className="text-sm font-semibold text-foreground">Services</h2>
          </div>
          <div className="overflow-x-auto p-4 sm:p-5">
            <table className="w-full min-w-[560px] text-xs">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="w-8 py-2" aria-label="Included" />
                  <th className="py-2 pr-3 font-medium">Service</th>
                  <th className="py-2 pr-3 font-medium">Description</th>
                  <th className="py-2 pr-3 text-right font-medium">Unit price</th>
                  <th className="py-2 pr-3 text-center font-medium">Qty</th>
                  <th className="py-2 pr-3 text-right font-medium">Total</th>
                  <th className="w-8 py-2" aria-label="Remove" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const price = Number.parseFloat(r.unitPrice || '0');
                  const lineTotal = ((Math.round(price * 100) * r.quantity) / 100).toFixed(2);
                  return (
                    <tr
                      key={r.key}
                      className={cn('border-b last:border-b-0', !r.included && 'opacity-60')}
                    >
                      <td className="py-2.5 pr-2">
                        <input
                          type="checkbox"
                          checked={r.included}
                          onChange={(e) =>
                            patchRow(r.key, {
                              included: e.target.checked,
                              quantity: e.target.checked && r.quantity === 0 ? 1 : r.quantity,
                            })
                          }
                          aria-label={`Include ${r.name}`}
                          className="size-4 accent-sky-600"
                        />
                      </td>
                      <td className="py-2.5 pr-3 font-medium text-foreground">{r.name}</td>
                      <td className="py-2.5 pr-3">
                        <Input
                          value={r.description}
                          onChange={(e) => patchRow(r.key, { description: e.target.value })}
                          aria-label={`Description for ${r.name}`}
                          className="h-8 min-w-44 text-xs"
                        />
                      </td>
                      <td className="py-2.5 pr-3 text-right">
                        <Input
                          value={r.unitPrice}
                          onChange={(e) => patchRow(r.key, { unitPrice: e.target.value })}
                          inputMode="decimal"
                          aria-label={`Unit price for ${r.name}`}
                          className="ml-auto h-8 w-24 text-right text-xs tabular-nums"
                        />
                      </td>
                      <td className="py-2.5 pr-3">
                        <div className="mx-auto flex w-fit items-center rounded-lg border">
                          <button
                            type="button"
                            aria-label={`Decrease quantity for ${r.name}`}
                            className="px-1.5 py-1 text-muted-foreground hover:text-foreground"
                            onClick={() =>
                              patchRow(r.key, { quantity: Math.max(0, r.quantity - 1) })
                            }
                          >
                            <Minus className="size-3" />
                          </button>
                          <span className="w-7 text-center tabular-nums">{r.quantity}</span>
                          <button
                            type="button"
                            aria-label={`Increase quantity for ${r.name}`}
                            className="px-1.5 py-1 text-muted-foreground hover:text-foreground"
                            onClick={() =>
                              patchRow(r.key, { quantity: r.quantity + 1, included: true })
                            }
                          >
                            <Plus className="size-3" />
                          </button>
                        </div>
                      </td>
                      <td className="py-2.5 pr-3 text-right font-medium tabular-nums text-foreground">
                        {r.included
                          ? formatCurrency(lineTotal, currency)
                          : formatCurrency('0', currency)}
                      </td>
                      <td className="py-2.5">
                        <button
                          type="button"
                          aria-label={`Remove ${r.name}`}
                          className="text-muted-foreground transition-colors hover:text-destructive"
                          onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="mt-3">
              {pickerOpen ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={pickerId}
                    onChange={(e) => setPickerId(e.target.value)}
                    aria-label="Service to add"
                    className="h-9 w-64 text-xs"
                  >
                    <option value="">Choose a service…</option>
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                  <Button type="button" size="sm" onClick={addService} disabled={!pickerId}>
                    Add
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setPickerOpen(false)}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPickerOpen(true)}
                >
                  <Plus className="mr-1.5 size-4" aria-hidden />
                  Add Service
                </Button>
              )}
            </div>
          </div>
        </section>

        {/* ── Info note ────────────────────────────────────────── */}
        <div className="flex items-start gap-2.5 rounded-xl border border-info/30 bg-info/5 px-4 py-3 text-xs text-foreground/80">
          <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
          <p>
            This pro forma will not create a payment request. You can use it to confirm the cost
            with the candidate before proceeding with payment.
          </p>
        </div>

        {/* ── Footer actions ───────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 shadow-sm ring-1 ring-border/60">
          <p className="text-[11px] text-muted-foreground">
            Print &amp; PDF become available from the workspace once the pro forma is issued.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => submit(false)}
            >
              Save Draft
            </Button>
            <Button type="button" disabled={pending} onClick={() => submit(true)}>
              <Check className="mr-1.5 size-4" aria-hidden />
              Create Pro Forma
            </Button>
          </div>
        </div>
      </div>

      {/* ── Right rail ──────────────────────────────────────────── */}
      <div className="space-y-5">
        <section className="rounded-xl border bg-card shadow-sm ring-1 ring-border/60">
          <div className="flex items-center gap-2.5 border-b px-4 py-3">
            <span
              aria-hidden
              className="grid size-7 place-items-center rounded-md bg-sky-100 text-sky-700"
            >
              <User className="size-4" />
            </span>
            <h2 className="text-sm font-semibold text-foreground">Candidate Information</h2>
          </div>
          <dl className="space-y-2.5 p-4 text-xs">
            {[
              ['Name', person.name],
              ['Email', person.email],
              ['Phone', person.phone],
              ['Nationality', person.nationality],
              ['Location', person.location],
            ].map(([label, value]) => (
              <div key={label} className="flex items-start gap-2">
                <dt className="w-20 shrink-0 text-muted-foreground">{label}:</dt>
                <dd className="min-w-0 flex-1 break-words font-medium text-foreground">
                  {value || '—'}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="rounded-xl border bg-card shadow-sm ring-1 ring-border/60">
          <div className="flex items-center gap-2.5 border-b px-4 py-3">
            <span
              aria-hidden
              className="grid size-7 place-items-center rounded-md bg-emerald-100 text-emerald-700"
            >
              <Calculator className="size-4" />
            </span>
            <h2 className="text-sm font-semibold text-foreground">Invoice Summary</h2>
          </div>
          <div className="space-y-2 p-4 text-sm">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Subtotal:</span>
              <span className="font-medium tabular-nums">{formatCurrency(subtotal, currency)}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">VAT (0%):</span>
              <span className="font-medium tabular-nums">{formatCurrency('0', currency)}</span>
            </div>
            <div className="flex items-center justify-between border-t pt-2.5">
              <span className="font-semibold">Total:</span>
              <span className="text-lg font-bold tabular-nums text-sky-700">
                {formatCurrency(subtotal, currency)}
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

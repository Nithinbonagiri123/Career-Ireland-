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
import { AmountSummary } from '@/components/ds/amount-summary';
import { SectionCard } from '@/components/ds/workspace';
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
  // Inline copy of the last error (the toast still fires) so it stays next
  // to the actions while the operator fixes it.
  const [formError, setFormError] = useState<string | null>(null);
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
    const fail = (message: string) => {
      setFormError(message);
      toast.error(message);
    };
    setFormError(null);
    if (lines.length === 0) {
      fail('Select at least one service with a quantity above zero.');
      return;
    }
    if (lines.some((l) => !(Number.parseFloat(l.unitPrice) > 0))) {
      fail('Every selected service needs a unit price above zero.');
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
        fail(created.error.message);
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

  const labelCls = 'text-xs font-medium text-foreground/80';

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-5">
        {/* ── Pro forma details ────────────────────────────────── */}
        <SectionCard icon={Settings2} title="Pro forma details">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="min-w-0 space-y-1">
              <label htmlFor="pf-date" className={labelCls}>
                Pro forma date
              </label>
              <Input
                id="pf-date"
                value={format(today, 'dd MMM yyyy')}
                readOnly
                aria-describedby="pf-date-hint"
                className="cursor-not-allowed bg-muted/40 text-sm"
                title="Stamped automatically when the pro forma is issued"
              />
              <p id="pf-date-hint" className="text-[11px] text-muted-foreground">
                Date and time are stamped when it&apos;s issued.
              </p>
            </div>
            <div className="min-w-0 space-y-1">
              <label htmlFor="pf-expiry" className={labelCls}>
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
            <div className="min-w-0 space-y-1">
              <label htmlFor="pf-terms" className={labelCls}>
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
            <div className="min-w-0 space-y-1">
              <label htmlFor="pf-currency" className={labelCls}>
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
        </SectionCard>

        {/* ── Services ─────────────────────────────────────────── */}
        {/* One list for every width: a table-like grid from md up, a card
            per service on phones — no sideways scroll, no duplicate inputs. */}
        <SectionCard icon={ListChecks} title="Services">
          <div
            aria-hidden
            className="hidden border-b border-border/60 pb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground md:grid md:grid-cols-[1.5rem_minmax(0,1fr)_minmax(0,1.3fr)_6.5rem_6rem_6.5rem_1.5rem] md:gap-3"
          >
            <span />
            <span>Service</span>
            <span>Description</span>
            <span className="text-right">Unit price</span>
            <span className="text-center">Qty</span>
            <span className="text-right">Total</span>
            <span />
          </div>
          <ul aria-label="Services on this pro forma" className="divide-y divide-border/50">
            {rows.map((r) => {
              const price = Number.parseFloat(r.unitPrice || '0');
              const lineTotal = ((Math.round(price * 100) * r.quantity) / 100).toFixed(2);
              return (
                <li
                  key={r.key}
                  className={cn(
                    'grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 py-3 md:grid-cols-[1.5rem_minmax(0,1fr)_minmax(0,1.3fr)_6.5rem_6rem_6.5rem_1.5rem]',
                    !r.included && 'opacity-60',
                  )}
                >
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
                  <span className="min-w-0 text-sm font-medium text-foreground [overflow-wrap:anywhere]">
                    {r.name}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${r.name}`}
                    className="grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:text-destructive md:order-last"
                    onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                  <div className="col-span-3 min-w-0 md:col-span-1">
                    <Input
                      value={r.description}
                      onChange={(e) => patchRow(r.key, { description: e.target.value })}
                      aria-label={`Description for ${r.name}`}
                      className="h-9 text-xs md:h-8"
                    />
                  </div>
                  <div className="col-span-3 grid grid-cols-3 items-center gap-3 md:contents">
                    <Input
                      value={r.unitPrice}
                      onChange={(e) => patchRow(r.key, { unitPrice: e.target.value })}
                      inputMode="decimal"
                      aria-label={`Unit price for ${r.name}`}
                      className="h-9 w-full text-right text-xs tabular-nums md:h-8"
                    />
                    <div className="mx-auto flex w-fit items-center rounded-lg border">
                      <button
                        type="button"
                        aria-label={`Decrease quantity for ${r.name}`}
                        className="px-2 py-1.5 text-muted-foreground hover:text-foreground"
                        onClick={() => patchRow(r.key, { quantity: Math.max(0, r.quantity - 1) })}
                      >
                        <Minus className="size-3" aria-hidden />
                      </button>
                      <span className="w-7 text-center text-xs tabular-nums">
                        <span className="sr-only">Quantity </span>
                        {r.quantity}
                      </span>
                      <button
                        type="button"
                        aria-label={`Increase quantity for ${r.name}`}
                        className="px-2 py-1.5 text-muted-foreground hover:text-foreground"
                        onClick={() =>
                          patchRow(r.key, { quantity: r.quantity + 1, included: true })
                        }
                      >
                        <Plus className="size-3" aria-hidden />
                      </button>
                    </div>
                    <span className="text-right text-sm font-medium tabular-nums text-foreground">
                      {r.included
                        ? formatCurrency(lineTotal, currency)
                        : formatCurrency('0', currency)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="mt-3">
            {pickerOpen ? (
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={pickerId}
                  onChange={(e) => setPickerId(e.target.value)}
                  aria-label="Service to add"
                  className="h-9 w-full text-xs sm:w-64"
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
              <Button type="button" variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
                <Plus className="mr-1.5 size-4" aria-hidden />
                Add Service
              </Button>
            )}
          </div>
        </SectionCard>

        {/* ── Info note ────────────────────────────────────────── */}
        <div className="flex items-start gap-2.5 rounded-2xl border border-info/30 bg-info/5 px-4 py-3 text-xs text-foreground/80">
          <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
          <p>
            This pro forma will not create a payment request. You can use it to confirm the cost
            with the candidate before proceeding with payment.
          </p>
        </div>

        {/* ── Footer actions ───────────────────────────────────── */}
        <div className="space-y-3 rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
          {formError && (
            <p
              role="alert"
              className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              {formError}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
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
      </div>

      {/* ── Right rail ──────────────────────────────────────────── */}
      <div className="min-w-0 space-y-5">
        <SectionCard icon={User} title="Candidate Information">
          <dl className="space-y-2.5 text-xs">
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
        </SectionCard>

        <SectionCard icon={Calculator} title="Pro forma summary">
          <AmountSummary
            label="Pro forma summary"
            currency={currency}
            lines={[
              { key: 'subtotal', label: 'Subtotal', amount: subtotal, emphasis: 'muted' },
              { key: 'vat', label: 'VAT (0%)', amount: 0, emphasis: 'muted' },
              { key: 'total', label: 'Total', amount: subtotal, emphasis: 'total' },
            ]}
          />
        </SectionCard>
      </div>
    </div>
  );
}

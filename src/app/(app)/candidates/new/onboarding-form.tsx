'use client';

import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  FileText,
  Loader2,
  Trash2,
  UserRound,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { FadeUp } from '@/components/motion/motion-primitives';
import { MultiDocumentUploader } from '@/components/multi-document-uploader';
import { type OccupationOption, OccupationPicker } from '@/components/occupation-picker';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { formatCurrency } from '@/lib/currency';
import { todayInDublin } from '@/lib/dates';
import { cn } from '@/lib/utils';
import type { InvoiceableService } from '@/modules/billing/read';
import {
  discardDraftAction,
  finaliseDraftAction,
  finaliseDraftComplimentaryAction,
  finaliseDraftWithoutPaymentAction,
  updateDraftPersonAction,
} from '@/modules/candidates/onboarding-actions';
import { CvSuggestionsPanel } from '../[id]/cv-suggestions-panel';

type Draft = {
  personId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  nationality: string;
  currentCity: string;
  currentCountry: string;
  irishImmigrationStatus: string;
  notes: string;
};

type Currency = { code: string; symbol: string };

type DocType = { id: string; name: string; code: string; hasExpiry: boolean };
type UploadedDoc = { id: string; filename: string; documentTypeId: string };

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const IMMIGRATION_OPTIONS: Array<[string, string]> = [
  ['NONE', 'Not currently in Ireland'],
  ['STAMP_1', 'Stamp 1'],
  ['STAMP_1G', 'Stamp 1G'],
  ['STAMP_2', 'Stamp 2'],
  ['STAMP_3', 'Stamp 3'],
  ['STAMP_4', 'Stamp 4'],
  ['PENDING', 'Application pending'],
  ['OTHER', 'Other'],
  ['NOT_PROVIDED', 'Not provided'],
];

/**
 * Debounces `fn` by `ms` milliseconds. Re-issuing during the wait cancels
 * the pending call and restarts the timer.
 */
function useDebounced<T extends (...args: never[]) => void>(fn: T, ms: number): T {
  const ref = useRef<ReturnType<typeof setTimeout> | null>(null);
  return useCallback(
    ((...args: Parameters<T>) => {
      if (ref.current) clearTimeout(ref.current);
      ref.current = setTimeout(() => fn(...args), ms);
    }) as T,
    [fn, ms],
  );
}

function defaultServiceAmount(s: InvoiceableService, currency: string): string {
  const pkg = s.packages.find((p) => p.currencyCode === currency) ?? s.packages[0];
  if (pkg) return pkg.price;
  if (s.defaultPrice) return s.defaultPrice;
  return '';
}

/** Numbered blue step header, matching the approved Screen 09 layout. */
function StepHeader({ n, title, sub }: { n: number; title: string; sub: string }) {
  return (
    <div className="flex items-start gap-3">
      <span
        aria-hidden
        className="grid size-7 shrink-0 place-items-center rounded-full bg-sky-600 text-xs font-bold text-white"
      >
        {n}
      </span>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
      </div>
    </div>
  );
}

const PAID_INTAKE_RESTRICTED_NOTE =
  'Recording a payment at intake is limited to Finance, Admin or the owner. Use “Create — invoice later” and Finance will record the payment from the profile.';

export function OnboardingForm({
  draft,
  currencies,
  docTypes,
  occupations,
  services,
  existingDocuments,
  canComplimentary = false,
  canRecordPayment = false,
}: {
  draft: Draft;
  currencies: Currency[];
  docTypes: DocType[];
  occupations: Array<{ id: string; name: string }>;
  services: InvoiceableService[];
  existingDocuments: UploadedDoc[];
  /** Stage B Wave 4 — current user may grant complimentary services. */
  canComplimentary?: boolean;
  /** Decision D1 — current user may record a paid intake (finance authority). */
  canRecordPayment?: boolean;
}) {
  const router = useRouter();

  // Personal / contact section state.
  const [personal, setPersonal] = useState({
    firstName: draft.firstName,
    lastName: draft.lastName,
    email: draft.email,
    phone: draft.phone,
    dateOfBirth: draft.dateOfBirth,
    nationality: draft.nationality,
    currentCity: draft.currentCity,
    currentCountry: draft.currentCountry,
    irishImmigrationStatus: draft.irishImmigrationStatus,
    notes: draft.notes,
  });

  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const savePersonal = useCallback(
    async (patch: typeof personal) => {
      setSaveState('saving');
      const result = await updateDraftPersonAction({
        personId: draft.personId,
        firstName: patch.firstName,
        lastName: patch.lastName,
        email: patch.email,
        phone: patch.phone,
        dateOfBirth: patch.dateOfBirth,
        nationality: patch.nationality,
        currentCity: patch.currentCity,
        currentCountry: patch.currentCountry,
        irishImmigrationStatus: (patch.irishImmigrationStatus || undefined) as
          | 'NONE'
          | 'STAMP_1'
          | 'STAMP_1G'
          | 'STAMP_2'
          | 'STAMP_3'
          | 'STAMP_4'
          | 'OTHER'
          | 'PENDING'
          | 'NOT_PROVIDED'
          | undefined,
        notes: patch.notes,
      });
      if (result.ok) {
        setSaveState('saved');
        setFieldErrors((prev) => {
          const next = { ...prev };
          for (const k of ['firstName', 'lastName', 'email', 'phone']) delete next[k];
          return next;
        });
        setTimeout(() => setSaveState('idle'), 1200);
      } else {
        setSaveState('error');
        if (result.error.fields) {
          setFieldErrors((prev) => ({ ...prev, ...result.error.fields }));
        }
      }
    },
    [draft.personId],
  );
  const debouncedSavePersonal = useDebounced(savePersonal, 800);

  useEffect(() => {
    debouncedSavePersonal(personal);
  }, [personal, debouncedSavePersonal]);

  // Payment section state.
  const [payment, setPayment] = useState({
    amount: '',
    currencyCode: currencies.find((c) => c.code === 'EUR')?.code ?? currencies[0]?.code ?? 'EUR',
    method: 'BANK_TRANSFER' as 'BANK_TRANSFER' | 'CASH' | 'OTHER',
    proofReference: '',
    receivedAt: todayInDublin(),
    notes: '',
  });

  // Stage B Wave 4 — complimentary mode: no payment at all; a genuine
  // €0.00 invoice is issued instead. Reason is mandatory and audited.
  const [complimentaryMode, setComplimentaryMode] = useState(false);
  // Recording money at intake is finance-only; complimentary has its own gate.
  const paidIntakeRestricted = !complimentaryMode && !canRecordPayment;
  const [complimentaryReason, setComplimentaryReason] = useState('');

  // Stage 6G Screen 09 — step 3: which services this payment covers.
  // Amounts default from the catalogue but stay editable; the total
  // auto-fills "Amount received" while at least one service is ticked.
  const [serviceRows, setServiceRows] = useState(() =>
    services.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description ?? '',
      amount: defaultServiceAmount(s, 'EUR'),
      selected: false,
    })),
  );
  const selectedServices = serviceRows.filter((r) => r.selected && r.amount);
  const servicesTotalCents = selectedServices.reduce(
    (acc, r) => acc + Math.round(Number.parseFloat(r.amount || '0') * 100),
    0,
  );
  const servicesTotal = (servicesTotalCents / 100).toFixed(2);
  useEffect(() => {
    if (selectedServices.length > 0) {
      setPayment((p) => ({ ...p, amount: servicesTotal }));
    }
  }, [servicesTotal, selectedServices.length]);

  const [coverLetter, setCoverLetter] = useState('');
  const [primaryOccupationId, setPrimaryOccupationId] = useState('');
  const [locallyCreatedOccupations, setLocallyCreatedOccupations] = useState<OccupationOption[]>(
    [],
  );
  const occupationOptions = useMemo(() => {
    const byId = new Map<string, OccupationOption>();
    for (const o of locallyCreatedOccupations) byId.set(o.id, o);
    for (const o of occupations) {
      if (!byId.has(o.id)) byId.set(o.id, { id: o.id, name: o.name, isActive: true });
    }
    return [...byId.values()];
  }, [occupations, locallyCreatedOccupations]);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [discarding, setDiscarding] = useState(false);

  const [uploads, setUploads] = useState<UploadedDoc[]>(existingDocuments);

  const canFinalise = complimentaryMode
    ? personal.firstName.trim().length > 0 &&
      personal.lastName.trim().length > 0 &&
      payment.currencyCode.trim().length > 0 &&
      complimentaryReason.trim().length >= 10
    : personal.firstName.trim().length > 0 &&
      personal.lastName.trim().length > 0 &&
      payment.amount.trim().length > 0 &&
      payment.currencyCode.trim().length > 0 &&
      payment.receivedAt.trim().length > 0;
  const canCreateWalkIn =
    personal.firstName.trim().length > 0 && personal.lastName.trim().length > 0;

  async function handleCreate() {
    setFormError(null);
    setFieldErrors({});
    setSubmitting(true);
    await savePersonal(personal);
    if (complimentaryMode) {
      const result = await finaliseDraftComplimentaryAction({
        personId: draft.personId,
        currencyCode: payment.currencyCode,
        reason: complimentaryReason.trim(),
        coverLetter,
        primaryOccupationId: primaryOccupationId || undefined,
        services:
          selectedServices.length > 0
            ? selectedServices.map((r) => ({ serviceCatalogItemId: r.id, name: r.name }))
            : undefined,
      });
      setSubmitting(false);
      if (!result.ok) {
        if (result.error.fields) setFieldErrors(result.error.fields);
        setFormError(result.error.message);
        toast.error(result.error.message);
        return;
      }
      toast.success(
        `Candidate created — complimentary invoice ${result.data.invoiceNumber} (0.00)`,
      );
      router.replace(`/candidates/${result.data.personId}?just_created=1`);
      router.refresh();
      return;
    }
    const result = await finaliseDraftAction({
      personId: draft.personId,
      payment,
      coverLetter,
      primaryOccupationId: primaryOccupationId || undefined,
      services:
        selectedServices.length > 0
          ? selectedServices.map((r) => ({
              serviceCatalogItemId: r.id,
              name: r.name,
              amount: Number.parseFloat(r.amount).toFixed(2),
            }))
          : undefined,
    });
    setSubmitting(false);
    if (!result.ok) {
      if (result.error.fields) setFieldErrors(result.error.fields);
      setFormError(result.error.message);
      toast.error(result.error.message);
      return;
    }
    toast.success(`Candidate created — ${result.data.invoiceNumber}`);
    router.replace(`/candidates/${result.data.personId}?just_created=1`);
    router.refresh();
  }

  async function handleCreateWalkIn() {
    setFormError(null);
    setFieldErrors({});
    setSubmitting(true);
    await savePersonal(personal);
    const result = await finaliseDraftWithoutPaymentAction({
      personId: draft.personId,
      coverLetter,
      primaryOccupationId: primaryOccupationId || undefined,
    });
    setSubmitting(false);
    if (!result.ok) {
      if (result.error.fields) setFieldErrors(result.error.fields);
      setFormError(result.error.message);
      toast.error(result.error.message);
      return;
    }
    toast.success('Candidate created — invoice later from the profile');
    router.replace(`/candidates/${result.data.personId}`);
    router.refresh();
  }

  async function handleDiscard() {
    setDiscarding(true);
    const result = await discardDraftAction(draft.personId);
    setDiscarding(false);
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    toast.success('Draft discarded');
    router.replace('/candidates');
    router.refresh();
  }

  const currencySymbol = currencies.find((c) => c.code === payment.currencyCode)?.symbol ?? '€';

  return (
    <div className="space-y-6 pb-10">
      <FadeUp delay={0.05}>
        {/* ── Main 4-step card — Screen 09 ─────────────────────── */}
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row items-start justify-between gap-3 border-b">
            <div className="flex items-start gap-3">
              <span
                aria-hidden
                className="grid size-9 shrink-0 place-items-center rounded-lg bg-sky-100 text-sky-700"
              >
                <UserRound className="size-4.5" />
              </span>
              <div>
                <CardTitle className="text-lg">Accept Payment &amp; Create Candidate</CardTitle>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Record a payment received from a customer and create a new candidate profile.
                </p>
              </div>
            </div>
            <SaveIndicator state={saveState} />
          </CardHeader>

          <CardContent className="space-y-8 pt-6">
            {/* ── Step 1 · Customer details ─────────────────────── */}
            <section aria-label="Customer details">
              <StepHeader
                n={1}
                title="Customer details"
                sub="Enter the details of the person who made the payment."
              />
              <div className="mt-4 grid gap-4 pl-10 md:grid-cols-2">
                <FieldPair
                  id="firstName"
                  label="First name *"
                  value={personal.firstName}
                  onChange={(v) => setPersonal((p) => ({ ...p, firstName: v }))}
                  error={fieldErrors.firstName}
                />
                <FieldPair
                  id="lastName"
                  label="Last name *"
                  value={personal.lastName}
                  onChange={(v) => setPersonal((p) => ({ ...p, lastName: v }))}
                  error={fieldErrors.lastName}
                />
                <FieldPair
                  id="email"
                  label="Email (optional)"
                  type="email"
                  value={personal.email}
                  onChange={(v) => setPersonal((p) => ({ ...p, email: v }))}
                  error={fieldErrors.email}
                />
                <FieldPair
                  id="phone"
                  label="Phone (optional)"
                  value={personal.phone}
                  onChange={(v) => setPersonal((p) => ({ ...p, phone: v }))}
                  error={fieldErrors.phone}
                />
                <FieldPair
                  id="nationality"
                  label="Nationality"
                  value={personal.nationality}
                  onChange={(v) => setPersonal((p) => ({ ...p, nationality: v }))}
                />
                <FieldPair
                  id="currentCountry"
                  label="Country of residence"
                  value={personal.currentCountry}
                  onChange={(v) => setPersonal((p) => ({ ...p, currentCountry: v }))}
                />
                <div className="space-y-1.5">
                  <Label htmlFor="irishImmigrationStatus">Irish immigration status</Label>
                  <Select
                    id="irishImmigrationStatus"
                    value={personal.irishImmigrationStatus}
                    onChange={(e) => {
                      const v = e.currentTarget.value;
                      setPersonal((p) => ({ ...p, irishImmigrationStatus: v }));
                    }}
                  >
                    <option value="">— not set —</option>
                    {IMMIGRATION_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </div>
                <FieldPair
                  id="dateOfBirth"
                  label="Date of birth"
                  type="date"
                  value={personal.dateOfBirth}
                  onChange={(v) => setPersonal((p) => ({ ...p, dateOfBirth: v }))}
                />
                <FieldPair
                  id="currentCity"
                  label="Current city"
                  value={personal.currentCity}
                  onChange={(v) => setPersonal((p) => ({ ...p, currentCity: v }))}
                />
                <div className="space-y-1.5">
                  <Label htmlFor="primaryOccupation">Primary occupation</Label>
                  <OccupationPicker
                    inputId="primaryOccupation"
                    options={occupationOptions}
                    value={primaryOccupationId}
                    onChange={setPrimaryOccupationId}
                    onOptionsChanged={(created) =>
                      setLocallyCreatedOccupations((prev) => [created, ...prev])
                    }
                    placeholder="Select occupation…"
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="notes">Notes / profile summary</Label>
                  <Textarea
                    id="notes"
                    className="min-h-20"
                    value={personal.notes}
                    onChange={(e) => {
                      const v = e.currentTarget.value;
                      setPersonal((p) => ({ ...p, notes: v }));
                    }}
                    placeholder="Short bio, key achievements, anything worth surfacing to recruiters…"
                    maxLength={2000}
                  />
                </div>
              </div>
            </section>

            {/* ── Step 2 · Payment details ──────────────────────── */}
            <section aria-label="Payment details">
              <StepHeader
                n={2}
                title="Payment details"
                sub="Record the payment that the customer has already made to us."
              />
              {canComplimentary && (
                <label className="mt-3 flex cursor-pointer items-start gap-2 pl-10 text-xs">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={complimentaryMode}
                    onChange={(e) => setComplimentaryMode(e.currentTarget.checked)}
                  />
                  <span>
                    <span className="font-semibold text-foreground">
                      Complimentary service (€0.00 — no payment)
                    </span>
                    <span className="block text-muted-foreground">
                      Issues a genuine €0.00 invoice with the next official number. No payment is
                      recorded and no receipt is issued. Requires a reason; the action is audited.
                    </span>
                  </span>
                </label>
              )}
              {complimentaryMode ? (
                <div className="mt-4 grid gap-4 pl-10 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="comp-currency">Currency *</Label>
                    <Select
                      id="comp-currency"
                      value={payment.currencyCode}
                      onChange={(e) => {
                        const v = e.currentTarget.value;
                        setPayment((p) => ({ ...p, currencyCode: v }));
                      }}
                      className="w-32"
                    >
                      {currencies.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.code}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <Label htmlFor="comp-reason">Reason (required, audited) *</Label>
                    <Textarea
                      id="comp-reason"
                      className="min-h-16"
                      value={complimentaryReason}
                      onChange={(e) => setComplimentaryReason(e.currentTarget.value)}
                      placeholder="e.g. Hardship waiver approved by management — see email of 20 Oct"
                      maxLength={500}
                      aria-invalid={Boolean(fieldErrors.reason)}
                    />
                    {complimentaryReason.trim().length > 0 &&
                      complimentaryReason.trim().length < 10 && (
                        <p className="text-xs text-status-warning">
                          Give a real reason — at least 10 characters.
                        </p>
                      )}
                    {fieldErrors.reason && (
                      <p className="text-xs text-destructive" role="alert">
                        {fieldErrors.reason}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="mt-4 grid gap-4 pl-10 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="amount">Amount received *</Label>
                    <div className="flex gap-2">
                      <span className="grid w-9 shrink-0 place-items-center rounded-lg border bg-muted/40 text-sm text-muted-foreground">
                        {currencySymbol}
                      </span>
                      <Input
                        id="amount"
                        type="text"
                        inputMode="decimal"
                        value={payment.amount}
                        onChange={(e) => {
                          const v = e.currentTarget.value;
                          setPayment((p) => ({ ...p, amount: v }));
                        }}
                        placeholder="e.g. 750.00"
                        aria-invalid={Boolean(fieldErrors['payment.amount'])}
                        className="min-w-0 flex-1"
                      />
                      <Select
                        aria-label="Currency"
                        value={payment.currencyCode}
                        onChange={(e) => {
                          const v = e.currentTarget.value;
                          setPayment((p) => ({ ...p, currencyCode: v }));
                        }}
                        className="w-24 shrink-0"
                      >
                        {currencies.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.code}
                          </option>
                        ))}
                      </Select>
                    </div>
                    {fieldErrors['payment.amount'] && (
                      <p className="text-xs text-destructive" role="alert">
                        {fieldErrors['payment.amount']}
                      </p>
                    )}
                  </div>
                  <FieldPair
                    id="receivedAt"
                    label="Payment date *"
                    type="date"
                    value={payment.receivedAt}
                    onChange={(v) => setPayment((p) => ({ ...p, receivedAt: v }))}
                    error={fieldErrors['payment.receivedAt']}
                  />
                  <div className="space-y-1.5">
                    <Label htmlFor="method">Payment method *</Label>
                    <Select
                      id="method"
                      value={payment.method}
                      onChange={(e) => {
                        const v = e.currentTarget.value as typeof payment.method;
                        setPayment((p) => ({ ...p, method: v }));
                      }}
                    >
                      <option value="BANK_TRANSFER">Bank transfer</option>
                      <option value="CASH">Cash</option>
                      <option value="OTHER">Other</option>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="proofReference">Reference number (optional)</Label>
                    <Input
                      id="proofReference"
                      value={payment.proofReference}
                      onChange={(e) => {
                        const v = e.currentTarget.value;
                        setPayment((p) => ({ ...p, proofReference: v }));
                      }}
                      placeholder="TXN-784512"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      e.g. bank reference, receipt number, transaction ID
                    </p>
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <Label htmlFor="paymentNotes">Payment notes</Label>
                    <Textarea
                      id="paymentNotes"
                      className="min-h-16"
                      value={payment.notes}
                      onChange={(e) => {
                        const v = e.currentTarget.value;
                        setPayment((p) => ({ ...p, notes: v }));
                      }}
                      maxLength={2000}
                    />
                  </div>
                </div>
              )}
            </section>

            {/* ── Step 3 · Services included ────────────────────── */}
            <section aria-label="Services included">
              <StepHeader
                n={3}
                title="Services included"
                sub="Select the service(s) that this payment is for."
              />
              <div className="mt-4 pl-10">
                {serviceRows.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No services in the catalogue yet — the invoice line will read “Candidate
                    Onboarding”.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full min-w-[480px] text-xs">
                      <thead>
                        <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                          <th className="w-9 px-3 py-2" aria-label="Included" />
                          <th className="py-2 pr-3 font-medium">Service</th>
                          <th className="py-2 pr-3 font-medium">Description</th>
                          <th className="py-2 pr-3 text-right font-medium">
                            Amount ({currencySymbol})
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {serviceRows.map((r) => (
                          <tr
                            key={r.id}
                            className={cn(
                              'border-b last:border-b-0',
                              !r.selected && 'text-muted-foreground',
                            )}
                          >
                            <td className="px-3 py-2.5">
                              <input
                                type="checkbox"
                                checked={r.selected}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setServiceRows((prev) =>
                                    prev.map((x) =>
                                      x.id === r.id ? { ...x, selected: checked } : x,
                                    ),
                                  );
                                }}
                                aria-label={`Include ${r.name}`}
                                className="size-4 accent-sky-600"
                              />
                            </td>
                            <td className="py-2.5 pr-3 font-medium text-foreground">{r.name}</td>
                            <td className="max-w-64 truncate py-2.5 pr-3">{r.description}</td>
                            <td className="py-2.5 pr-3 text-right">
                              <Input
                                value={r.amount}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setServiceRows((prev) =>
                                    prev.map((x) => (x.id === r.id ? { ...x, amount: v } : x)),
                                  );
                                }}
                                inputMode="decimal"
                                aria-label={`Amount for ${r.name}`}
                                className="ml-auto h-8 w-24 text-right text-xs tabular-nums"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t bg-muted/20">
                          <td className="px-3 py-2.5" />
                          <td className="py-2.5 pr-3 text-sm font-semibold text-foreground">
                            Total
                          </td>
                          <td className="py-2.5 pr-3" />
                          <td className="py-2.5 pr-3 text-right text-sm font-bold tabular-nums text-sky-700">
                            {formatCurrency(servicesTotal, payment.currencyCode)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
                {selectedServices.length > 0 && (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    The selected services auto-fill the amount received and are named on the
                    invoice.
                  </p>
                )}
              </div>
            </section>

            {/* ── Step 4 · Create candidate profile ─────────────── */}
            <section aria-label="Create candidate profile">
              <StepHeader
                n={4}
                title="Create candidate profile"
                sub="A new candidate profile will be created with the details above."
              />
              <div className="mt-4 pl-10">
                <ul className="space-y-2 rounded-lg border border-sky-200/70 bg-sky-50/50 p-4 text-xs text-foreground/90">
                  {(complimentaryMode
                    ? [
                        'Candidate profile will be created as Active',
                        'No payment will be recorded and no receipt issued — nothing is owed',
                        'An official €0.00 complimentary invoice will be generated with the next sequential number',
                      ]
                    : [
                        'Candidate profile will be created as Active',
                        'Payment will be recorded in the system',
                        'An official invoice and receipt will be generated automatically',
                      ]
                  ).map((line) => (
                    <li key={line} className="flex items-start gap-2">
                      <CheckCircle2
                        className="mt-0.5 size-3.5 shrink-0 text-status-success"
                        aria-hidden
                      />
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <AnimatePresence>
              {formError && (
                <motion.div
                  key="form-err"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.18 }}
                  className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                  role="alert"
                >
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <span>{formError}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {paidIntakeRestricted && (
              <p className="text-xs text-muted-foreground" data-testid="paid-intake-restricted">
                {PAID_INTAKE_RESTRICTED_NOTE}
              </p>
            )}

            {/* ── Footer actions ────────────────────────────────── */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-5">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDiscardOpen(true)}
                  disabled={submitting || discarding}
                >
                  <Trash2 className="mr-1.5 size-4" aria-hidden />
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleCreateWalkIn}
                  disabled={!canCreateWalkIn || submitting || discarding}
                  title="Create the candidate profile now, raise an invoice from their profile later."
                >
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                      Creating…
                    </>
                  ) : (
                    'Create — invoice later'
                  )}
                </Button>
              </div>
              <Button
                type="button"
                onClick={handleCreate}
                disabled={!canFinalise || paidIntakeRestricted || submitting || discarding}
                title={paidIntakeRestricted ? PAID_INTAKE_RESTRICTED_NOTE : undefined}
                className="h-11 px-5 font-semibold"
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                    Creating…
                  </>
                ) : (
                  <>
                    {complimentaryMode
                      ? 'Grant complimentary & create candidate'
                      : 'Accept payment & create candidate'}
                    <ArrowRight className="ml-2 size-4" aria-hidden />
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </FadeUp>

      {/* ── Documents & CV (kept from the long-form flow) ───────── */}
      <FadeUp delay={0.1}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Documents</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Optional. Drop multiple files at once — each row picks its own type + display name.
              Missing a type? Pick <span className="font-medium">+ New type…</span> and it&apos;ll
              show up in every dropdown across the system.
            </p>
          </CardHeader>
          <CardContent>
            <MultiDocumentUploader
              ownerType="PERSON"
              ownerId={draft.personId}
              documentTypes={docTypes}
              onUploaded={(doc) =>
                setUploads((prev) => [
                  ...prev,
                  {
                    id: doc.id,
                    filename: doc.displayName ?? doc.originalFilename,
                    documentTypeId: doc.documentTypeId,
                  },
                ])
              }
            />
            {uploads.length > 0 && (
              <ul className="mt-4 divide-y rounded-md border" data-ic-uploads="list">
                {uploads.map((u) => {
                  const typeName =
                    docTypes.find((t) => t.id === u.documentTypeId)?.name ?? 'Document';
                  return (
                    <li
                      key={u.id}
                      className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <FileText className="size-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{u.filename}</p>
                          <p className="text-[11px] text-muted-foreground">{typeName}</p>
                        </div>
                      </div>
                      <span className="text-[10px] uppercase tracking-wider text-status-success">
                        Attached
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="mt-4 space-y-1.5">
              <Label htmlFor="coverLetter">Cover letter</Label>
              <Textarea
                id="coverLetter"
                className="min-h-28"
                value={coverLetter}
                onChange={(e) => setCoverLetter(e.currentTarget.value)}
                maxLength={10000}
                placeholder="Dear hiring manager,…"
              />
            </div>
          </CardContent>
        </Card>
      </FadeUp>

      {uploads.length > 0 && (
        <FadeUp delay={0.15}>
          <CvSuggestionsPanel personId={draft.personId} />
        </FadeUp>
      )}

      <Dialog
        open={discardOpen}
        onOpenChange={(next) => {
          if (!discarding) setDiscardOpen(next);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discard this draft?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            The draft candidate row is deleted — nothing is saved. The invoice and receipt have not
            been generated yet, so this leaves no financial trail. Cancel if you&apos;d rather leave
            the draft in place and come back to it later.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDiscardOpen(false)} disabled={discarding}>
              Keep draft
            </Button>
            <Button variant="destructive" onClick={handleDiscard} disabled={discarding}>
              {discarding && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
              Discard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FieldPair({
  id,
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  inputMode,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  error?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        aria-invalid={Boolean(error)}
      />
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === 'idle') return null;
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {state === 'saving' && (
        <>
          <Loader2 className="size-3 animate-spin" /> Saving…
        </>
      )}
      {state === 'saved' && (
        <>
          <CheckCircle2 className="size-3 text-accent" /> Saved
        </>
      )}
      {state === 'error' && (
        <>
          <AlertCircle className="size-3 text-destructive" />{' '}
          <span className="text-destructive">Save failed</span>
        </>
      )}
    </div>
  );
}

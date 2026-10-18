'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { motion } from 'framer-motion';
import { AlertCircle, FileText, Loader2, Plus, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { CatalogAutosuggest, type Selection } from '@/components/catalog-autosuggest';
import { type OccupationOption, OccupationPicker } from '@/components/occupation-picker';
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
import type { Currency } from '@/lib/db/schema/currencies';
import {
  COUNTRIES_SORTED,
  findCountryByName,
  IRISH_IMMIGRATION_STATUSES,
} from '@/lib/iso-countries';
import { generateInvoiceAction } from '@/modules/billing/generate-actions';
import type { InvoiceableService } from '@/modules/billing/read';
import { createLeadAction } from '@/modules/leads/actions';
import { findSimilarPersonsAction } from '@/modules/persons/actions';
import type { SimilarMatch } from '@/modules/persons/repository';
import { type CreatePersonInput, CreatePersonSchema } from '@/modules/persons/schemas';
import { createServiceItemFromNameAction } from '@/modules/services-catalog/actions';

/**
 * "New lead" dialog. Atomic flow: person details (top) + optional
 * first invoice (bottom). Owner asked for this on 2026-09-16 — the
 * common case is "someone paid, log them + issue the invoice in one
 * step". If the service section is left blank the dialog degrades to
 * a bare lead; additional invoices can then be issued from the row
 * menu.
 *
 * On save:
 *   1. createLeadAction → creates person + lead.
 *   2. If a service is picked with qty+unitPrice+currency present,
 *      generateInvoiceAction fires immediately with the returned
 *      personId as the payer. Two sequential actions, not a single
 *      transaction, so an invoice failure leaves the lead intact
 *      and the operator can retry from the row menu.
 *   3. On success, we navigate to the printable invoice.
 */
export function CreateLeadDialog({
  invoiceableServices,
  currencies,
  occupations,
}: {
  invoiceableServices: InvoiceableService[];
  currencies: Currency[];
  occupations: OccupationOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [matches, setMatches] = useState<SimilarMatch[] | null>(null);
  const [checking, startCheck] = useTransition();
  // Which part of the business this lead is destined for. The dialog swaps
  // between a person sub-form (CS + Immigration) and an employer sub-form
  // (Recruitment) based on this. Default CS = the current common case.
  const [targetBusiness, setTargetBusiness] = useState<
    'CANDIDATE_SERVICES' | 'RECRUITMENT' | 'IMMIGRATION'
  >('CANDIDATE_SERVICES');
  // Recruitment (employer-payer) sub-form state — only relevant when
  // targetBusiness === 'RECRUITMENT'. Kept simple: legalName is required,
  // everything else optional. A richer employer form is available on
  // /employers if the operator wants to prep the record ahead of time.
  const [employerLegalName, setEmployerLegalName] = useState('');
  const [employerCountry, setEmployerCountry] = useState('');
  const [employerCity, setEmployerCity] = useState('');
  const [employerNotes, setEmployerNotes] = useState('');
  const [employerSubmitting, setEmployerSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    getValues,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreatePersonInput>({
    resolver: zodResolver(CreatePersonSchema),
    defaultValues: {
      firstName: '',
      middleName: '',
      lastName: '',
      email: '',
      phone: '',
      dateOfBirth: '',
      nationality: '',
      // Stage 6E Section 4 — international default: residence pre-fills
      // to South Africa (the business's largest source market). Operator
      // can change to any ISO country.
      currentCountry: 'South Africa',
      currentCity: '',
      addressLine1: '',
      addressLine2: '',
      primaryOccupationId: '',
      source: 'DIRECT',
      notes: '',
    },
  });

  // Stage 6E Section 4 — Irish immigration status for CS leads.
  // Captured on the form, serialised into the lead's `notes` with a
  // structured prefix so no schema migration is required at this stage.
  // The Client Workspace reads it back from notes to render the
  // immigration badge on the candidate card. A dedicated column + the
  // Stage 5 immigration_cases catalog mapping is a follow-up.
  const [immigrationStatus, setImmigrationStatus] = useState<string>('NOT_PROVIDED');
  // Stage 6E Section 4 — compound phone input: calling code + national
  // number. Combined into E.164 on submit. The calling-code picker
  // seeds from the selected residence country but can be changed
  // independently.
  const [phoneCountryCode, setPhoneCountryCode] = useState<string>('27'); // South Africa default
  const [phoneNationalNumber, setPhoneNationalNumber] = useState<string>('');
  // Local list of occupations so inline-created ones appear immediately
  // without a refetch. See occupation-picker for the pattern.
  const [localOccupations, setLocalOccupations] = useState<OccupationOption[]>(occupations);
  const selectedOccupationId = watch('primaryOccupationId') ?? '';

  // ── Optional first-invoice state ──────────────────────────────
  const [serviceId, setServiceId] = useState<string>('');
  const [serviceSelection, setServiceSelection] = useState<Selection>(null);
  const [localServices, setLocalServices] = useState<InvoiceableService[]>(invoiceableServices);
  const [packageId, setPackageId] = useState<string>('');
  const [qty, setQty] = useState<string>('1');
  const [unitPrice, setUnitPrice] = useState<string>('');
  const activeCurrencies = useMemo(() => currencies.filter((c) => c.isActive), [currencies]);
  const [currency, setCurrency] = useState<string>(
    activeCurrencies.find((c) => c.code === 'EUR')?.code ?? activeCurrencies[0]?.code ?? 'EUR',
  );
  const [lineDescription, setLineDescription] = useState<string>('');

  const service = useMemo(
    () => localServices.find((s) => s.id === serviceId),
    [localServices, serviceId],
  );

  const onServiceChange = (nextId: string) => {
    setServiceId(nextId);
    setPackageId('');
    setUnitPrice('');
    setCurrency(
      activeCurrencies.find((c) => c.code === 'EUR')?.code ?? activeCurrencies[0]?.code ?? 'EUR',
    );
    setLineDescription('');
  };

  const onPackageChange = (pkgId: string) => {
    setPackageId(pkgId);
    const pkg = service?.packages.find((p) => p.id === pkgId);
    if (pkg) {
      setUnitPrice(pkg.price);
      setCurrency(pkg.currencyCode);
    }
  };

  const invoiceIsValid = useMemo(() => {
    if (!service) return false;
    const qtyNum = Number.parseInt(qty, 10);
    if (!Number.isInteger(qtyNum) || qtyNum <= 0) return false;
    if (!/^\d+(\.\d{1,2})?$/.test(unitPrice)) return false;
    if (!/^[A-Z]{3}$/.test(currency)) return false;
    return true;
  }, [service, qty, unitPrice, currency]);

  const resetAll = () => {
    reset();
    setMatches(null);
    setFormError(null);
    setServiceId('');
    setServiceSelection(null);
    setPackageId('');
    setQty('1');
    setUnitPrice('');
    setCurrency(
      activeCurrencies.find((c) => c.code === 'EUR')?.code ?? activeCurrencies[0]?.code ?? 'EUR',
    );
    setLineDescription('');
    setTargetBusiness('CANDIDATE_SERVICES');
    setEmployerLegalName('');
    setEmployerCountry('');
    setEmployerCity('');
    setEmployerNotes('');
    setEmployerSubmitting(false);
  };

  const runInvoiceIfPresentForEmployer = async (employerId: string): Promise<void> => {
    if (!service || !invoiceIsValid) return;
    const inv = await generateInvoiceAction({
      payerMode: 'EMPLOYER',
      payerId: employerId,
      serviceCatalogItemId: service.id,
      servicePackageId: packageId || null,
      qty: Number.parseInt(qty, 10),
      unitPrice,
      currencyCode: currency,
      lineDescription: lineDescription.trim() || null,
    });
    if (!inv.ok) {
      toast.error(
        `Lead created, but invoice generation failed: ${inv.error.message}. Retry via the row menu.`,
      );
      return;
    }
    toast.success(`Invoice ${inv.data.invoiceNumber} issued`);
    router.push(inv.data.printPath);
  };

  const submitAsNewEmployer = async () => {
    setFormError(null);
    if (employerLegalName.trim().length < 2) {
      setFormError('Employer legal name is required.');
      return;
    }
    setEmployerSubmitting(true);
    const result = await createLeadAction({
      mode: 'NEW_EMPLOYER',
      targetBusiness: 'RECRUITMENT',
      employer: {
        legalName: employerLegalName.trim(),
        tradingName: '',
        website: '',
        industry: '',
        country: employerCountry,
        city: employerCity,
        relationshipStatus: 'PROSPECT',
        vatTreatment: 'STANDARD',
        assignedUserId: '',
        notes: employerNotes,
      },
    });
    setEmployerSubmitting(false);
    if (!result.ok) {
      setFormError(result.error.message);
      return;
    }
    toast.success('Recruitment lead created');
    if (result.data.employerId) await runInvoiceIfPresentForEmployer(result.data.employerId);
    resetAll();
    setOpen(false);
  };

  const runInvoiceIfPresent = async (personId: string): Promise<void> => {
    if (!service || !invoiceIsValid) return;
    // Stage 6D Wave 1a — Candidate Services leads are quote-first. Creating
    // a CS lead must NEVER generate an invoice; the operator issues a quote
    // from the Client Workspace and the official invoice emerges on payment
    // verification. Immigration + Recruitment keep the atomic path because
    // they don't use pro-formas.
    if (targetBusiness === 'CANDIDATE_SERVICES') return;
    const inv = await generateInvoiceAction({
      payerMode: 'PERSON',
      payerId: personId,
      serviceCatalogItemId: service.id,
      servicePackageId: packageId || null,
      qty: Number.parseInt(qty, 10),
      unitPrice,
      currencyCode: currency,
      lineDescription: lineDescription.trim() || null,
    });
    if (!inv.ok) {
      toast.error(
        `Lead created, but invoice generation failed: ${inv.error.message}. Retry via the row menu.`,
      );
      return;
    }
    toast.success(`Invoice ${inv.data.invoiceNumber} issued`);
    router.push(inv.data.printPath);
  };

  const checkDuplicates = () => {
    const { firstName, lastName, email, phone } = getValues();
    if (!firstName || !lastName) {
      toast.error('Enter a first and last name first');
      return;
    }
    startCheck(async () => {
      const result = await findSimilarPersonsAction({
        firstName,
        lastName,
        email: email || undefined,
        phone: phone || undefined,
      });
      if (result.ok) {
        setMatches(result.data);
        if (result.data.length === 0) toast.success('No duplicates found');
      } else {
        toast.error(result.error.message);
      }
    });
  };

  const submitAsNewPerson = handleSubmit(async (data) => {
    setFormError(null);
    // Stage 6E Section 4 — combine the compound phone input into
    // E.164 before dispatch. Zod validator enforces the shape. If
    // operator entered the number including the leading +, keep that;
    // otherwise prefix with +{callingCode}.
    const rawPhone = data.phone?.trim() ?? '';
    const combinedPhone =
      rawPhone.length === 0
        ? phoneNationalNumber.trim().length > 0
          ? `+${phoneCountryCode}${phoneNationalNumber.replace(/\D/g, '')}`
          : ''
        : rawPhone;
    // Attach the Irish immigration status to notes with a marker so the
    // workspace / candidate card can parse it back. Keeps the data in
    // place without a schema migration this stage.
    const existingNotes = (data.notes ?? '').trim();
    const immigrationLabel =
      IRISH_IMMIGRATION_STATUSES.find((s) => s.value === immigrationStatus)?.label ?? '';
    const prefix = existingNotes ? `${existingNotes}\n\n` : '';
    const notesWithImmigration =
      immigrationStatus && immigrationStatus !== 'NOT_PROVIDED'
        ? `${prefix}[Irish immigration status: ${immigrationLabel}]`
        : existingNotes;
    const result = await createLeadAction({
      mode: 'NEW_PERSON',
      // Target is picked at the top of the dialog. CS is the default and
      // covers the most common flow; Immigration uses the same person-based
      // sub-form. Recruitment takes a separate employer sub-form (below).
      targetBusiness: targetBusiness === 'RECRUITMENT' ? 'CANDIDATE_SERVICES' : targetBusiness,
      person: {
        ...data,
        phone: combinedPhone,
        notes: notesWithImmigration,
      },
    });
    if (!result.ok) {
      setFormError(result.error.message);
      return;
    }
    toast.success('Lead created');
    if (!result.data.personId) {
      resetAll();
      setOpen(false);
      return;
    }
    const personId = result.data.personId;
    await runInvoiceIfPresent(personId);
    resetAll();
    setOpen(false);
  });

  const submitAsExistingPerson = (personId: string) => {
    startCheck(async () => {
      const result = await createLeadAction({
        mode: 'EXISTING_PERSON',
        targetBusiness: targetBusiness === 'RECRUITMENT' ? 'CANDIDATE_SERVICES' : targetBusiness,
        personId,
      });
      if (result.ok) {
        toast.success('Lead created and linked to existing person');
        await runInvoiceIfPresent(personId);
        resetAll();
        setOpen(false);
      } else {
        toast.error(result.error.message);
      }
    });
  };

  const watched = watch(['firstName', 'lastName']);
  const canCheck = Boolean(watched[0] && watched[1]);
  const submitLabel =
    targetBusiness !== 'CANDIDATE_SERVICES' && service && invoiceIsValid
      ? 'Create lead + issue invoice'
      : 'Create lead';

  // Clear the duplicate-matches panel the moment the user starts
  // editing name OR email OR phone — otherwise the panel from a prior
  // check lingers even when it no longer reflects the current form
  // values, making the operator unsure whether they're about to create
  // a new person or accidentally overwrite the matched one.
  const watchedForClear = watch(['firstName', 'lastName', 'email', 'phone']);
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally clear on any field change
  useEffect(() => {
    if (matches) setMatches(null);
    // Only re-run when the watched values themselves change — not when
    // setMatches identity changes (it doesn't) or when matches change
    // (we'd loop).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedForClear[0], watchedForClear[1], watchedForClear[2], watchedForClear[3]]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetAll();
      }}
    >
      <DialogTrigger
        render={
          <Button size="sm">
            <Plus className="mr-1.5 size-4" /> New lead
          </Button>
        }
      />
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create a new lead</DialogTitle>
          <DialogDescription>
            Pick which part of the business this lead is for — the form fields adapt. Person + lead
            for Candidate Services and Immigration; employer + lead for Recruitment. Optional first
            invoice at the bottom.
          </DialogDescription>
        </DialogHeader>

        {/* Target-business picker — always visible at the top. Sets the
            downstream lead + invoice flow. */}
        <div className="mb-4 space-y-1.5">
          <Label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            For which part of the business?
          </Label>
          <div
            role="tablist"
            aria-label="Target business"
            className="grid grid-cols-3 overflow-hidden rounded-md border"
          >
            {(
              [
                ['CANDIDATE_SERVICES', 'Candidate Services'],
                ['RECRUITMENT', 'Recruitment'],
                ['IMMIGRATION', 'Immigration'],
              ] as const
            ).map(([key, label]) => {
              const active = targetBusiness === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTargetBusiness(key)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? 'bg-foreground text-background'
                      : 'bg-transparent text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {targetBusiness === 'RECRUITMENT'
              ? 'Payer = employer. On Accept, the lead becomes a Job Requisition for that employer.'
              : targetBusiness === 'IMMIGRATION'
                ? 'Payer = person. On Accept, the lead becomes an Immigration Case for that person.'
                : 'Payer = person. On Accept, the person becomes an active candidate profile.'}
          </p>
        </div>

        {targetBusiness === 'RECRUITMENT' ? (
          <div className="space-y-5">
            {/* ── Employer + Lead (recruitment) ─────────────────────── */}
            <section className="space-y-3">
              <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Employer
              </h3>
              <p className="text-[11px] text-muted-foreground">
                Minimal fields to raise the lead. The full employer profile (contacts, website,
                industry, …) can be filled in from <span className="font-mono">/employers</span>{' '}
                once the lead is Accepted.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="rl-legal">Legal name</Label>
                <Input
                  id="rl-legal"
                  value={employerLegalName}
                  onChange={(e) => setEmployerLegalName(e.target.value)}
                  placeholder="e.g. ABC Manufacturing Ltd"
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="rl-country">Country</Label>
                  <Input
                    id="rl-country"
                    value={employerCountry}
                    onChange={(e) => setEmployerCountry(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rl-city">City</Label>
                  <Input
                    id="rl-city"
                    value={employerCity}
                    onChange={(e) => setEmployerCity(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rl-notes">Notes</Label>
                <textarea
                  id="rl-notes"
                  rows={2}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={employerNotes}
                  onChange={(e) => setEmployerNotes(e.target.value)}
                />
              </div>
            </section>

            {formError && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
                role="alert"
              >
                <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                <span>{formError}</span>
              </motion.div>
            )}

            <DialogFooter className="sticky bottom-0 z-10 -mx-4 mt-2 border-t border-border/60 bg-popover px-4 py-3 shadow-[0_-8px_16px_-8px_rgb(0_0_0_/_0.15)]">
              <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
              <Button type="button" onClick={submitAsNewEmployer} disabled={employerSubmitting}>
                {employerSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
                {service && invoiceIsValid ? 'Create lead + issue invoice' : 'Create lead'}
              </Button>
            </DialogFooter>
          </div>
        ) : null}

        {targetBusiness !== 'RECRUITMENT' && (
          <form onSubmit={submitAsNewPerson} className="space-y-5" noValidate>
            {/* ── Person + Lead ────────────────────────────────── */}
            <section className="space-y-3">
              <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Person
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="cl-first">First name</Label>
                  <Input
                    id="cl-first"
                    aria-invalid={Boolean(errors.firstName)}
                    {...register('firstName')}
                  />
                  {errors.firstName && (
                    <p className="text-xs text-destructive">{errors.firstName.message}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cl-last">Last name</Label>
                  <Input
                    id="cl-last"
                    aria-invalid={Boolean(errors.lastName)}
                    {...register('lastName')}
                  />
                  {errors.lastName && (
                    <p className="text-xs text-destructive">{errors.lastName.message}</p>
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cl-middle">Middle name (optional)</Label>
                <Input id="cl-middle" {...register('middleName')} />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="cl-email">
                    Email
                    {targetBusiness === 'CANDIDATE_SERVICES' && (
                      <span className="text-destructive"> *</span>
                    )}
                  </Label>
                  <Input id="cl-email" type="email" {...register('email')} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cl-phone">
                    Mobile number
                    {targetBusiness === 'CANDIDATE_SERVICES' && (
                      <span className="text-destructive"> *</span>
                    )}
                  </Label>
                  {/* Stage 6E Section 4 — compound international phone
                      input. The calling-code select is seeded from the
                      residence country but changeable. The national
                      number input accepts digits only; the server
                      validates the combined value as E.164. */}
                  <div className="flex gap-1.5">
                    <Select
                      aria-label="Country calling code"
                      className="w-28"
                      value={phoneCountryCode}
                      onChange={(e) => setPhoneCountryCode(e.target.value)}
                    >
                      {COUNTRIES_SORTED.filter((c) => c.callingCode).map((c) => (
                        <option key={c.code} value={c.callingCode}>
                          +{c.callingCode} {c.code}
                        </option>
                      ))}
                    </Select>
                    <Input
                      id="cl-phone"
                      type="tel"
                      placeholder="National number"
                      value={phoneNationalNumber}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, '');
                        setPhoneNationalNumber(digits);
                        setValue('phone', `+${phoneCountryCode}${digits}`, { shouldDirty: true });
                      }}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Stored in international format, e.g. +353871234567 or +27821234567.
                  </p>
                </div>
              </div>
              {targetBusiness === 'CANDIDATE_SERVICES' && (
                <div className="space-y-1.5">
                  <Label htmlFor="cl-profession">
                    Primary profession
                    <span className="text-destructive"> *</span>
                  </Label>
                  <input type="hidden" {...register('primaryOccupationId')} />
                  <OccupationPicker
                    inputId="cl-profession"
                    options={localOccupations}
                    value={selectedOccupationId}
                    onChange={(id) => setValue('primaryOccupationId', id, { shouldDirty: true })}
                    onOptionsChanged={(opt) =>
                      setLocalOccupations((prev) =>
                        prev.some((o) => o.id === opt.id) ? prev : [opt, ...prev],
                      )
                    }
                    placeholder="Pick profession…"
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="cl-addr1">
                  Address <span className="text-xs text-muted-foreground">(optional)</span>
                </Label>
                <Input id="cl-addr1" {...register('addressLine1')} />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="cl-country">
                    Country of residence
                    {targetBusiness === 'CANDIDATE_SERVICES' && (
                      <span className="text-destructive"> *</span>
                    )}
                  </Label>
                  {/* Stage 6E Section 4 — ISO country datalist. Also
                      resets the phone calling-code when the operator
                      picks a new residence country. */}
                  <Input
                    id="cl-country"
                    list="cl-country-options"
                    {...register('currentCountry', {
                      onChange: (e) => {
                        const c = findCountryByName(e.target.value);
                        if (c) setPhoneCountryCode(c.callingCode);
                      },
                    })}
                  />
                  <datalist id="cl-country-options">
                    {COUNTRIES_SORTED.map((c) => (
                      <option key={c.code} value={c.name} />
                    ))}
                  </datalist>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cl-city">
                    City <span className="text-xs text-muted-foreground">(optional)</span>
                  </Label>
                  <Input id="cl-city" {...register('currentCity')} />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="cl-nat">
                    Nationality <span className="text-xs text-muted-foreground">(optional)</span>
                  </Label>
                  {/* Stage 6E Section 4 — nationality is independent of
                      residence. Operator can leave blank or pick any
                      demonym. */}
                  <Input id="cl-nat" list="cl-nat-options" {...register('nationality')} />
                  <datalist id="cl-nat-options">
                    {COUNTRIES_SORTED.filter((c) => c.nationality).map((c) => (
                      <option key={c.code} value={c.nationality} />
                    ))}
                  </datalist>
                </div>
                {targetBusiness === 'CANDIDATE_SERVICES' && (
                  <div className="space-y-1.5">
                    <Label htmlFor="cl-irish">
                      Irish immigration status{' '}
                      <span className="text-xs text-muted-foreground">(optional)</span>
                    </Label>
                    <Select
                      id="cl-irish"
                      value={immigrationStatus}
                      onChange={(e) => setImmigrationStatus(e.target.value)}
                    >
                      {IRISH_IMMIGRATION_STATUSES.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cl-source">Source</Label>
                <Select id="cl-source" {...register('source')}>
                  <option value="DIRECT">Direct inquiry</option>
                  <option value="REFERRAL">Referral</option>
                  <option value="ADVERTISEMENT">Advertisement</option>
                  <option value="EMPLOYER_REFERRAL">Employer referral</option>
                  <option value="OTHER">Other</option>
                </Select>
              </div>

              <div className="flex items-center justify-between rounded-md border border-dashed p-3">
                <div className="text-xs text-muted-foreground">
                  Check whether this person is already in the system before saving.
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canCheck || checking}
                  onClick={checkDuplicates}
                >
                  {checking ? (
                    <Loader2 className="mr-2 size-3.5 animate-spin" />
                  ) : (
                    <Users className="mr-2 size-3.5" />
                  )}
                  Check duplicates
                </Button>
              </div>

              {matches && matches.length > 0 && (
                <div className="space-y-2 rounded-md border border-status-warning/40 bg-status-warning-soft p-3">
                  <p className="text-xs font-medium text-status-warning">
                    {matches.length} possible match{matches.length > 1 ? 'es' : ''} found. Reuse an
                    existing person instead of creating a duplicate?
                  </p>
                  <div className="space-y-1.5">
                    {matches.map((m) => (
                      <div
                        key={m.person.id}
                        className="flex items-center justify-between rounded border bg-background/50 px-2.5 py-1.5"
                      >
                        <div className="min-w-0 text-xs">
                          <div className="truncate font-medium">
                            {m.person.firstName} {m.person.lastName}
                          </div>
                          <div className="truncate text-muted-foreground">
                            {m.person.email ?? m.person.phone ?? 'no contact'} · matched on{' '}
                            {m.reasons.join(', ').toLowerCase().replace(/_/g, ' ')}
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => submitAsExistingPerson(m.person.id)}
                          disabled={checking}
                        >
                          Reuse
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* ── Optional first invoice ──────────────────────────
               Stage 6D Wave 1a — Candidate Services leads must stay
               quote-first (lead → quote → payment → invoice). The whole
               section is hidden for CS so there's no path to a direct
               invoice at lead-creation time. Immigration keeps it; those
               flows don't use pro-formas. */}
            {targetBusiness !== 'CANDIDATE_SERVICES' && (
              <section className="space-y-3 rounded-md border bg-muted/20 p-4">
                <div className="flex items-center gap-2">
                  <FileText className="size-4 text-muted-foreground" aria-hidden />
                  <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                    First invoice (optional)
                  </h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  Fill this in to issue an invoice immediately after the lead is created. Skip to
                  log the lead only.
                </p>

                {invoiceableServices.length === 0 ? (
                  <div className="rounded border border-dashed p-3 text-xs text-muted-foreground">
                    No active person-payable services in the catalog. Add one in{' '}
                    <a href="/admin/services" className="underline">
                      /admin/services
                    </a>{' '}
                    first.
                  </div>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="cl-svc" className="text-xs">
                        Service
                      </Label>
                      <CatalogAutosuggest
                        inputId="cl-svc"
                        options={localServices.map((s) => ({
                          id: s.id,
                          name: s.name,
                          isActive: true,
                        }))}
                        value={serviceSelection}
                        onChange={(v) => {
                          setServiceSelection(v);
                          onServiceChange(v?.kind === 'catalog' ? v.id : '');
                        }}
                        placeholder="Type to search — or add a new service (leave blank to skip)"
                        createLabel="Add service"
                        onCreateNew={async (name) => {
                          const r = await createServiceItemFromNameAction({ name });
                          if (!r.ok) throw new Error(r.error.message);
                          const newService: InvoiceableService = {
                            id: r.data.id,
                            code: r.data.code,
                            name: r.data.name,
                            payerType: r.data.payerType,
                            packages: [],
                          };
                          setLocalServices((prev) => [...prev, newService]);
                          return { id: r.data.id, label: r.data.name };
                        }}
                      />
                    </div>

                    {serviceId && (
                      <>
                        {(service?.packages.length ?? 0) > 0 && (
                          <div className="space-y-1.5">
                            <Label htmlFor="cl-pkg" className="text-xs">
                              Prefill from package (optional)
                            </Label>
                            <Select
                              id="cl-pkg"
                              value={packageId}
                              onChange={(e) => onPackageChange(e.target.value)}
                            >
                              <option value="">— none, enter unit price manually —</option>
                              {service?.packages.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.currencyCode} · {formatCurrency(p.price, p.currencyCode)} ·{' '}
                                  {p.name}
                                </option>
                              ))}
                            </Select>
                          </div>
                        )}

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          <div className="space-y-1.5">
                            <Label htmlFor="cl-qty" className="text-xs">
                              QTY
                            </Label>
                            <Input
                              id="cl-qty"
                              inputMode="numeric"
                              value={qty}
                              onChange={(e) => setQty(e.target.value.replace(/[^0-9]/g, ''))}
                              placeholder="1"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="cl-unit" className="text-xs">
                              Unit price
                            </Label>
                            <Input
                              id="cl-unit"
                              inputMode="decimal"
                              value={unitPrice}
                              onChange={(e) => setUnitPrice(e.target.value)}
                              placeholder="e.g. 100.00"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="cl-cur" className="text-xs">
                              Currency
                            </Label>
                            <Select
                              id="cl-cur"
                              value={currency}
                              onChange={(e) => setCurrency(e.target.value)}
                            >
                              {activeCurrencies.map((c) => (
                                <option key={c.code} value={c.code}>
                                  {c.code}
                                </option>
                              ))}
                            </Select>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <Label htmlFor="cl-desc" className="text-xs">
                            Line description (optional)
                          </Label>
                          <Input
                            id="cl-desc"
                            value={lineDescription}
                            onChange={(e) => setLineDescription(e.target.value)}
                            placeholder={service?.name ?? ''}
                          />
                        </div>
                      </>
                    )}
                  </>
                )}
              </section>
            )}

            {formError && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
                role="alert"
              >
                <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                <span>{formError}</span>
              </motion.div>
            )}

            <DialogFooter className="sticky bottom-0 z-10 -mx-4 mt-2 border-t border-border/60 bg-popover px-4 py-3 shadow-[0_-8px_16px_-8px_rgb(0_0_0_/_0.15)]">
              <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
                {submitLabel}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  Briefcase as BriefcaseIcon,
  FileText,
  Globe as GlobeIcon,
  Loader2,
  Plus,
  User as UserIcon,
  Users,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { CatalogAutosuggest, type Selection } from '@/components/catalog-autosuggest';
import { Field, TintedFormSection as FormSection } from '@/components/form-section';
import { type OccupationOption, OccupationPicker } from '@/components/occupation-picker';
import { PhoneCountryPicker } from '@/components/phone-country-picker';
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
  WORK_ELIGIBILITY_OPTIONS,
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
      // Stage 6G Screen 02 — new field defaults.
      postcode: '',
      yearsOfExperience: '',
      employmentStatus: '',
      professionalSummary: '',
      workEligibility: '',
      currentlyInIreland: undefined,
      source: 'DIRECT',
      notes: '',
    },
  });

  // Stage 6E+1 — Irish immigration status for CS leads. Captured on the
  // form and written to the dedicated `persons.irish_immigration_status`
  // column via `createLeadAction` (Stage 6E stored this inside the
  // `notes` field with a `[Irish immigration status: X]` marker; the
  // Stage 6E+1 migration 0055 lifted those marker values into the
  // dedicated column, and this form now writes structured values
  // directly). Candidate Card + Client Workspace read from the column.
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
  // Stage 6G Screen 02 — rendered via a tri-state Yes/No/unspecified
  // Select; watch so the dropdown reflects the current form value.
  const currentlyInIreland = watch('currentlyInIreland');

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
    // Stage 6E+1 — write Irish immigration status to the dedicated
    // column. NOT_PROVIDED / '' both resolve to the explicit
    // "NOT_PROVIDED" enum value when the operator chose it, or null
    // when nothing was selected.
    const structuredImmigrationStatus =
      immigrationStatus && immigrationStatus !== ''
        ? (immigrationStatus as (typeof IRISH_IMMIGRATION_STATUSES)[number]['value'])
        : null;
    const result = await createLeadAction({
      mode: 'NEW_PERSON',
      // Target is picked at the top of the dialog. CS is the default and
      // covers the most common flow; Immigration uses the same person-based
      // sub-form. Recruitment takes a separate employer sub-form (below).
      targetBusiness: targetBusiness === 'RECRUITMENT' ? 'CANDIDATE_SERVICES' : targetBusiness,
      person: {
        ...data,
        phone: combinedPhone,
        irishImmigrationStatus: structuredImmigrationStatus,
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
      {/* Stage 6G Screen 02 — restructured to match the approved
          mockup: three iconized sections (Personal / Professional /
          Immigration & eligibility) with a 3-column grid inside
          each. The target-business picker is still at the top so
          operators can switch to Recruitment / Immigration flows,
          but the layout underneath prioritises the CS variant. */}
      <DialogContent className="max-h-[92dvh] gap-5 overflow-y-auto p-6 sm:max-w-5xl sm:p-7">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-2xl font-semibold tracking-tight">
            Create New Lead
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Enter candidate, business or organisation data to start a new lead.
          </DialogDescription>
        </DialogHeader>

        {/* Target-business picker — always visible at the top. Sets the
            downstream lead + invoice flow. */}
        <div className="mb-5 space-y-2">
          <Label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            For which part of the business?
          </Label>
          <div
            role="tablist"
            aria-label="Target business"
            className="grid grid-cols-3 gap-1.5 rounded-xl bg-muted/50 p-1.5"
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
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-foreground text-background shadow-sm'
                      : 'bg-transparent text-muted-foreground hover:bg-background/60 hover:text-foreground'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
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
          <form
            onSubmit={submitAsNewPerson}
            className="space-y-5 [&_[data-slot=input]]:h-10 [&_[data-slot=input]]:bg-background [&_[data-slot=input]]:px-3 [&_[data-slot=input]]:text-sm [&_[data-slot=select]]:h-10 [&_[data-slot=select]]:bg-background [&_[data-slot=select]]:px-3 [&_[data-slot=select]]:text-sm"
            noValidate
          >
            {/* ── Section 1: Personal details ──────────────────── */}
            <FormSection
              icon={UserIcon}
              iconTone="blue"
              title="Personal details"
              subtitle="Candidate's name, contact and address"
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field id="cl-first" label="First name" required error={errors.firstName?.message}>
                  <Input
                    id="cl-first"
                    aria-invalid={Boolean(errors.firstName)}
                    {...register('firstName')}
                  />
                </Field>
                <Field id="cl-middle" label="Middle name">
                  <Input id="cl-middle" {...register('middleName')} />
                </Field>
                <Field id="cl-last" label="Last name" required error={errors.lastName?.message}>
                  <Input
                    id="cl-last"
                    aria-invalid={Boolean(errors.lastName)}
                    {...register('lastName')}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field id="cl-dob" label="Date of birth">
                  <Input id="cl-dob" type="date" {...register('dateOfBirth')} />
                </Field>
                <Field
                  id="cl-email"
                  label="Email"
                  required={targetBusiness === 'CANDIDATE_SERVICES'}
                >
                  <Input
                    id="cl-email"
                    type="email"
                    placeholder="name@example.com"
                    {...register('email')}
                  />
                </Field>
                <Field
                  id="cl-phone"
                  label="Mobile number"
                  required={targetBusiness === 'CANDIDATE_SERVICES'}
                >
                  {/* Stage 6G Screen 02 — compound phone input styled as a
                      single integrated control: searchable country picker
                      on the left (flag + +code), national-number input on
                      the right. Visually one field; two controls under
                      the hood. */}
                  <div className="flex h-10 overflow-visible rounded-lg border border-input bg-background transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
                    <PhoneCountryPicker
                      value={phoneCountryCode}
                      onChange={(code) => {
                        setPhoneCountryCode(code);
                        setValue('phone', `+${code}${phoneNationalNumber}`, { shouldDirty: true });
                      }}
                      className="w-28 shrink-0 border-r border-input"
                    />
                    <input
                      id="cl-phone"
                      type="tel"
                      placeholder="National number"
                      value={phoneNationalNumber}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, '');
                        setPhoneNationalNumber(digits);
                        setValue('phone', `+${phoneCountryCode}${digits}`, { shouldDirty: true });
                      }}
                      className="h-full min-w-0 flex-1 bg-transparent px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none"
                    />
                  </div>
                </Field>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field
                  id="cl-country"
                  label="Country of residence"
                  required={targetBusiness === 'CANDIDATE_SERVICES'}
                >
                  <Input
                    id="cl-country"
                    list="cl-country-options"
                    placeholder="Start typing…"
                    {...register('currentCountry', {
                      onChange: (e) => {
                        const c = findCountryByName(e.target.value);
                        if (c?.callingCode) setPhoneCountryCode(c.callingCode);
                      },
                    })}
                  />
                  <datalist id="cl-country-options">
                    {COUNTRIES_SORTED.map((c) => (
                      <option key={c.code} value={c.name} />
                    ))}
                  </datalist>
                </Field>
                <Field id="cl-nat" label="Nationality">
                  <Input
                    id="cl-nat"
                    list="cl-nat-options"
                    placeholder="e.g. South African"
                    {...register('nationality')}
                  />
                  <datalist id="cl-nat-options">
                    {COUNTRIES_SORTED.filter((c) => c.nationality).map((c) => (
                      <option key={c.code} value={c.nationality} />
                    ))}
                  </datalist>
                </Field>
                <Field id="cl-city" label="City">
                  <Input id="cl-city" placeholder="City" {...register('currentCity')} />
                </Field>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field id="cl-addr1" label="Address line 1">
                  <Input id="cl-addr1" placeholder="Street address" {...register('addressLine1')} />
                </Field>
                <Field id="cl-addr2" label="Address line 2">
                  <Input
                    id="cl-addr2"
                    placeholder="Apartment, suite…"
                    {...register('addressLine2')}
                  />
                </Field>
                <Field id="cl-postcode" label="Postcode">
                  <Input id="cl-postcode" placeholder="e.g. D02 X285" {...register('postcode')} />
                </Field>
              </div>
            </FormSection>

            {/* ── Section 2: Professional information ─────────── */}
            {targetBusiness === 'CANDIDATE_SERVICES' && (
              <FormSection
                icon={BriefcaseIcon}
                iconTone="amber"
                title="Professional information"
                subtitle="Candidate's primary profession and background"
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Field id="cl-profession" label="Primary profession" required>
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
                      placeholder="Pick a profession…"
                    />
                  </Field>
                  <Field id="cl-yoe" label="Years of experience">
                    <Select id="cl-yoe" {...register('yearsOfExperience')}>
                      <option value="">— select —</option>
                      <option value="<1 year">Less than 1 year</option>
                      <option value="1-2 years">1–2 years</option>
                      <option value="3-5 years">3–5 years</option>
                      <option value="5-10 years">5–10 years</option>
                      <option value="10-20 years">10–20 years</option>
                      <option value="20+ years">20+ years</option>
                    </Select>
                  </Field>
                  <Field id="cl-emp" label="Current employment status">
                    <Select id="cl-emp" {...register('employmentStatus')}>
                      <option value="">— select —</option>
                      <option value="EMPLOYED">Employed</option>
                      <option value="UNEMPLOYED">Unemployed</option>
                      <option value="SELF_EMPLOYED">Self-employed</option>
                      <option value="STUDENT">Student</option>
                      <option value="RETIRED">Retired</option>
                      <option value="OTHER">Other</option>
                    </Select>
                  </Field>
                </div>
                <Field id="cl-prosum" label="Professional summary (optional)">
                  <textarea
                    id="cl-prosum"
                    rows={3}
                    placeholder="Short blurb about the candidate's background, specialisms, strengths…"
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground"
                    {...register('professionalSummary')}
                  />
                </Field>
              </FormSection>
            )}

            {/* ── Section 3: Immigration & eligibility ─────────── */}
            {targetBusiness === 'CANDIDATE_SERVICES' && (
              <FormSection
                icon={GlobeIcon}
                iconTone="teal"
                title="Immigration & eligibility"
                subtitle="Current Irish permission and operator notes"
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Field id="cl-elig" label="Main eligibility">
                    <Select id="cl-elig" {...register('workEligibility')}>
                      <option value="">— select —</option>
                      {WORK_ELIGIBILITY_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field id="cl-irish" label="Irish immigration status">
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
                  </Field>
                  <Field id="cl-inie" label="Currently living in Ireland?">
                    <Select
                      id="cl-inie"
                      value={
                        currentlyInIreland === true
                          ? 'YES'
                          : currentlyInIreland === false
                            ? 'NO'
                            : ''
                      }
                      onChange={(e) => {
                        const v = e.target.value;
                        setValue(
                          'currentlyInIreland',
                          v === 'YES' ? true : v === 'NO' ? false : undefined,
                          { shouldDirty: true },
                        );
                      }}
                    >
                      <option value="">— not provided —</option>
                      <option value="YES">Yes</option>
                      <option value="NO">No</option>
                    </Select>
                  </Field>
                </div>
                <Field id="cl-notes" label="Additional notes">
                  <textarea
                    id="cl-notes"
                    rows={3}
                    placeholder="Anything else the operator should know (optional)…"
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground"
                    {...register('notes')}
                  />
                </Field>
              </FormSection>
            )}

            {/* Duplicate check + matches — tucked under the sections
                so operators see it before submitting without it
                dominating the form. */}
            <div className="flex items-center justify-between rounded-lg border border-dashed p-3">
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
                            description: null,
                            categoryName: null,
                            defaultPrice: null,
                            defaultCurrencyCode: null,
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

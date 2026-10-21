'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { motion } from 'framer-motion';
import { AlertCircle, Briefcase, Globe, Loader2, Pencil, UserRound } from 'lucide-react';
import { type ReactElement, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import {
  Field,
  FORM_INPUT_SIZING,
  TintedFormSection as FormSection,
} from '@/components/form-section';
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
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { Occupation } from '@/lib/db/schema/occupations';
import type { CandidateProfile, Person } from '@/lib/db/schema/persons';
import { COUNTRIES_SORTED, IRISH_IMMIGRATION_STATUSES } from '@/lib/iso-countries';
import { cn } from '@/lib/utils';
import { updatePersonAction } from '@/modules/persons/actions';
import { type UpdatePersonInput, UpdatePersonSchema } from '@/modules/persons/schemas';

/**
 * Reusable edit dialog covering both the underlying persons row AND the
 * candidate_profiles row (when the person has one). Fields:
 *   - Person: firstName, lastName, email, phone, dateOfBirth, nationality,
 *     currentCountry, currentCity, notes
 *   - Candidate profile (optional section, only rendered when candidateProfile
 *     is passed): primary occupation, years of experience, work eligibility,
 *     preferred location, profile summary
 *
 * Excludes person.source — that's the one-shot classification at intake and
 * shouldn't be revised (would corrupt 'how did they come to us' reporting).
 *
 * Passes through to updatePersonAction which audits both tables with a full
 * before/after snapshot so support can trace who edited what and when.
 */
export function EditPersonDialog({
  person,
  candidateProfile,
  occupations,
  trigger,
}: {
  person: Person;
  /** Optional. Renders the extra candidate profile section. */
  candidateProfile?: CandidateProfile | null;
  /** Occupation list for the primary-occupation autosuggest. Required when
   *  candidateProfile is passed. isActive is used so inactive entries can
   *  still bind to existing profiles without being suggested as picks. */
  occupations?: Pick<Occupation, 'id' | 'name' | 'isActive'>[];
  trigger?: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Locally-created occupations get merged with the server-provided list so
  // a just-inline-created one appears in suggestions without a page refresh.
  const [locallyCreatedOccupations, setLocallyCreatedOccupations] = useState<
    Pick<Occupation, 'id' | 'name' | 'isActive'>[]
  >([]);
  // Dedupe by id: once a server refresh pulls in a locally-created
  // occupation, it exists in both arrays. React throws a duplicate-key
  // warning on the picker's <option> map without this.
  const allOccupations = useMemo(() => {
    const byId = new Map<string, Pick<Occupation, 'id' | 'name' | 'isActive'>>();
    for (const o of locallyCreatedOccupations) byId.set(o.id, o);
    for (const o of occupations ?? []) {
      if (!byId.has(o.id)) byId.set(o.id, o);
    }
    return [...byId.values()];
  }, [occupations, locallyCreatedOccupations]);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<UpdatePersonInput>({
    resolver: zodResolver(UpdatePersonSchema),
    defaultValues: {
      personId: person.id,
      firstName: person.firstName,
      middleName: person.middleName ?? '',
      lastName: person.lastName,
      email: person.email ?? '',
      phone: person.phone ?? '',
      dateOfBirth: person.dateOfBirth ?? '',
      nationality: person.nationality ?? '',
      currentCountry: person.currentCountry ?? '',
      currentCity: person.currentCity ?? '',
      addressLine1: person.addressLine1 ?? '',
      addressLine2: person.addressLine2 ?? '',
      postcode: person.postcode ?? '',
      irishImmigrationStatus: person.irishImmigrationStatus ?? '',
      notes: person.notes ?? '',
      primaryOccupationId: candidateProfile?.primaryOccupationId ?? '',
      yearsOfExperience: candidateProfile?.yearsOfExperience ?? '',
      // Stage B Wave 1 — fall back to the person row so saving the
      // dialog for a not-yet-activated person round-trips the
      // lead-captured eligibility instead of clearing it.
      workEligibility: candidateProfile?.workEligibility ?? person.workEligibility ?? '',
      preferredLocation: candidateProfile?.preferredLocation ?? '',
      profileSummary: candidateProfile?.profileSummary ?? '',
    },
  });

  const currentOccupationId = useWatch({ control, name: 'primaryOccupationId' });

  const onSubmit = handleSubmit(async (data) => {
    setFormError(null);
    const r = await updatePersonAction(data);
    if (!r.ok) {
      setFormError(r.error.message);
      return;
    }
    toast.success('Details updated');
    reset(data);
    setOpen(false);
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          reset();
          setFormError(null);
        }
      }}
    >
      <DialogTrigger
        render={
          trigger ?? (
            <Button variant="outline">
              <Pencil className="mr-1.5 size-4" /> Edit details
            </Button>
          )
        }
      />
      <DialogContent className="max-h-[92dvh] gap-5 overflow-y-auto p-6 sm:max-w-5xl sm:p-7">
        <DialogHeader>
          <DialogTitle className="text-2xl font-semibold tracking-tight">Edit details</DialogTitle>
          <DialogDescription>
            Update {person.firstName}’s personal, professional and immigration information.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className={cn('space-y-5', FORM_INPUT_SIZING)} noValidate>
          {/* ── Section 1: Personal information ──────────────── */}
          <FormSection
            icon={UserRound}
            iconTone="blue"
            title="Personal information"
            subtitle="Identity, contact details and current address"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field id="ep-first" label="First name" required error={errors.firstName?.message}>
                <Input
                  id="ep-first"
                  aria-invalid={Boolean(errors.firstName)}
                  {...register('firstName')}
                />
              </Field>
              <Field id="ep-middle" label="Middle name">
                <Input id="ep-middle" {...register('middleName')} />
              </Field>
              <Field id="ep-last" label="Last name" required error={errors.lastName?.message}>
                <Input
                  id="ep-last"
                  aria-invalid={Boolean(errors.lastName)}
                  {...register('lastName')}
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field id="ep-email" label="Email" error={errors.email?.message}>
                <Input
                  id="ep-email"
                  type="email"
                  aria-invalid={Boolean(errors.email)}
                  {...register('email')}
                />
              </Field>
              <Field id="ep-phone" label="Mobile number">
                <Input id="ep-phone" placeholder="+353 87 123 4567" {...register('phone')} />
              </Field>
              <Field id="ep-dob" label="Date of birth">
                <Input id="ep-dob" type="date" {...register('dateOfBirth')} />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field id="ep-country" label="Country of residence">
                <Input
                  id="ep-country"
                  list="ep-country-options"
                  placeholder="Start typing…"
                  {...register('currentCountry')}
                />
                <datalist id="ep-country-options">
                  {COUNTRIES_SORTED.map((c) => (
                    <option key={c.code} value={c.name} />
                  ))}
                </datalist>
              </Field>
              <Field id="ep-nat" label="Nationality">
                <Input
                  id="ep-nat"
                  list="ep-nat-options"
                  placeholder="e.g. South African"
                  {...register('nationality')}
                />
                <datalist id="ep-nat-options">
                  {COUNTRIES_SORTED.filter((c) => c.nationality).map((c) => (
                    <option key={c.code} value={c.nationality} />
                  ))}
                </datalist>
              </Field>
              <Field id="ep-city" label="City">
                <Input id="ep-city" {...register('currentCity')} />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field id="ep-addr1" label="Address line 1">
                <Input id="ep-addr1" placeholder="Street address" {...register('addressLine1')} />
              </Field>
              <Field id="ep-addr2" label="Address line 2">
                <Input
                  id="ep-addr2"
                  placeholder="Apartment, suite…"
                  {...register('addressLine2')}
                />
              </Field>
              <Field id="ep-postcode" label="Postcode">
                <Input id="ep-postcode" placeholder="e.g. D02 X285" {...register('postcode')} />
              </Field>
            </div>
          </FormSection>

          {/* ── Section 2: Professional information — only when this
                 person has an active candidate profile. ──────────── */}
          {candidateProfile && (
            <FormSection
              icon={Briefcase}
              iconTone="amber"
              title="Professional information"
              subtitle="Occupation, experience and profile summary"
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field id="ep-occupation" label="Primary occupation">
                  <OccupationPicker
                    inputId="ep-occupation"
                    options={allOccupations}
                    value={currentOccupationId ?? ''}
                    onChange={(id) =>
                      setValue('primaryOccupationId', id, {
                        shouldDirty: true,
                        shouldValidate: true,
                      })
                    }
                    onOptionsChanged={(created: OccupationOption) =>
                      setLocallyCreatedOccupations((prev) => [created, ...prev])
                    }
                  />
                </Field>
                <Field id="ep-yoe" label="Years of experience">
                  <Input
                    id="ep-yoe"
                    placeholder="e.g. 5, 10+, entry-level"
                    {...register('yearsOfExperience')}
                  />
                </Field>
                <Field id="ep-pref-location" label="Preferred work location">
                  <Input
                    id="ep-pref-location"
                    placeholder="e.g. Dublin, Cork, remote"
                    {...register('preferredLocation')}
                  />
                </Field>
              </div>
              <Field id="ep-summary" label="Profile summary">
                <Textarea
                  id="ep-summary"
                  rows={3}
                  placeholder="One-paragraph description shown on shortlists + candidate cards"
                  {...register('profileSummary')}
                />
              </Field>
            </FormSection>
          )}

          {/* ── Section 3: Immigration & eligibility ─────────── */}
          <FormSection
            icon={Globe}
            iconTone="teal"
            title="Immigration & eligibility"
            subtitle="Current Irish immigration status and right to work"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field id="ep-imm" label="Irish immigration status">
                <Select id="ep-imm" {...register('irishImmigrationStatus')}>
                  <option value="">—</option>
                  {IRISH_IMMIGRATION_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </Field>
              {candidateProfile && (
                <Field id="ep-eligibility" label="Work eligibility">
                  <Input
                    id="ep-eligibility"
                    placeholder="e.g. Stamp 4, EU citizen"
                    {...register('workEligibility')}
                  />
                </Field>
              )}
              <Field id="ep-notes" label="Notes">
                <Textarea id="ep-notes" rows={2} {...register('notes')} />
              </Field>
            </div>
          </FormSection>

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
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <Button type="submit" disabled={isSubmitting || !isDirty}>
              {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

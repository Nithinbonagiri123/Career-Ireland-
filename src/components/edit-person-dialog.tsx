'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { motion } from 'framer-motion';
import { AlertCircle, Loader2, Pencil } from 'lucide-react';
import { type ReactElement, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { type OccupationOption, OccupationPicker } from '@/components/occupation-picker';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Occupation } from '@/lib/db/schema/occupations';
import type { CandidateProfile, Person } from '@/lib/db/schema/persons';
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
  const allOccupations = useMemo(
    () => [...locallyCreatedOccupations, ...(occupations ?? [])],
    [occupations, locallyCreatedOccupations],
  );

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
      lastName: person.lastName,
      email: person.email ?? '',
      phone: person.phone ?? '',
      dateOfBirth: person.dateOfBirth ?? '',
      nationality: person.nationality ?? '',
      currentCountry: person.currentCountry ?? '',
      currentCity: person.currentCity ?? '',
      notes: person.notes ?? '',
      primaryOccupationId: candidateProfile?.primaryOccupationId ?? '',
      yearsOfExperience: candidateProfile?.yearsOfExperience ?? '',
      workEligibility: candidateProfile?.workEligibility ?? '',
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
            <Button variant="outline" size="sm">
              <Pencil className="mr-1.5 size-3.5" /> Edit details
            </Button>
          )
        }
      />
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit details</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ep-first">First name</Label>
              <Input
                id="ep-first"
                aria-invalid={Boolean(errors.firstName)}
                {...register('firstName')}
              />
              {errors.firstName && (
                <p className="text-xs text-destructive">{errors.firstName.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ep-last">Last name</Label>
              <Input
                id="ep-last"
                aria-invalid={Boolean(errors.lastName)}
                {...register('lastName')}
              />
              {errors.lastName && (
                <p className="text-xs text-destructive">{errors.lastName.message}</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ep-email">Email</Label>
              <Input
                id="ep-email"
                type="email"
                aria-invalid={Boolean(errors.email)}
                {...register('email')}
              />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ep-phone">Phone</Label>
              <Input id="ep-phone" {...register('phone')} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ep-dob">Date of birth</Label>
              <Input id="ep-dob" type="date" {...register('dateOfBirth')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ep-nat">Nationality</Label>
              <Input id="ep-nat" {...register('nationality')} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ep-country">Country</Label>
              <Input id="ep-country" {...register('currentCountry')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ep-city">City</Label>
              <Input id="ep-city" {...register('currentCity')} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ep-notes">Notes</Label>
            <textarea
              id="ep-notes"
              rows={3}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              {...register('notes')}
            />
          </div>

          {/* Candidate profile section — only renders when this person has an
              active candidate profile. Same dialog, extra fields on top of the
              person ones so the operator doesn't hunt between surfaces. */}
          {candidateProfile && (
            <div className="space-y-4 rounded-md border border-border/60 bg-muted/20 p-4">
              <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Candidate profile
              </h3>
              <div className="space-y-1.5">
                <Label htmlFor="ep-occupation">Primary occupation</Label>
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
                <p className="text-[11px] text-muted-foreground">
                  Every occupation in the catalog is listed. The last row is “+ New occupation…” —
                  pick it to add a new occupation that becomes reusable everywhere.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="ep-yoe">Years of experience</Label>
                  <Input
                    id="ep-yoe"
                    placeholder="e.g. 5, 10+, entry-level"
                    {...register('yearsOfExperience')}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ep-eligibility">Work eligibility</Label>
                  <Input
                    id="ep-eligibility"
                    placeholder="e.g. Stamp 4, EU citizen"
                    {...register('workEligibility')}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ep-pref-location">Preferred work location</Label>
                <Input
                  id="ep-pref-location"
                  placeholder="e.g. Dublin, Cork, remote"
                  {...register('preferredLocation')}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ep-summary">Profile summary</Label>
                <textarea
                  id="ep-summary"
                  rows={3}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  placeholder="One-paragraph description shown on shortlists + candidate cards"
                  {...register('profileSummary')}
                />
              </div>
            </div>
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

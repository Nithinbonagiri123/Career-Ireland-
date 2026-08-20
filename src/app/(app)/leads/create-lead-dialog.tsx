'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { motion } from 'framer-motion';
import { AlertCircle, Loader2, Plus, Users } from 'lucide-react';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
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
import { createLeadAction } from '@/modules/leads/actions';
import { findSimilarPersonsAction } from '@/modules/persons/actions';
import type { SimilarMatch } from '@/modules/persons/repository';
import { type CreatePersonInput, CreatePersonSchema } from '@/modules/persons/schemas';

export function CreateLeadDialog() {
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [matches, setMatches] = useState<SimilarMatch[] | null>(null);
  const [checking, startCheck] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<CreatePersonInput>({
    resolver: zodResolver(CreatePersonSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      dateOfBirth: '',
      nationality: '',
      currentCountry: '',
      currentCity: '',
      source: 'DIRECT',
      notes: '',
    },
  });

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
    const result = await createLeadAction({ mode: 'NEW_PERSON', person: data });
    if (!result.ok) {
      setFormError(result.error.message);
      return;
    }
    toast.success('Lead created');
    reset();
    setMatches(null);
    setOpen(false);
  });

  const submitAsExistingPerson = (personId: string) => {
    startCheck(async () => {
      const result = await createLeadAction({ mode: 'EXISTING_PERSON', personId });
      if (result.ok) {
        toast.success('Lead created and linked to existing person');
        reset();
        setMatches(null);
        setOpen(false);
      } else {
        toast.error(result.error.message);
      }
    });
  };

  const watched = watch(['firstName', 'lastName']);
  const canCheck = Boolean(watched[0] && watched[1]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          reset();
          setMatches(null);
          setFormError(null);
        }
      }}
    >
      <DialogTrigger
        render={
          <Button size="sm">
            <Plus className="mr-1.5 size-4" /> New lead
          </Button>
        }
      />
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create a new lead</DialogTitle>
          <DialogDescription>
            Person + Lead in one step. Check for duplicates before saving to avoid double-recording
            the same human.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submitAsNewPerson} className="space-y-4" noValidate>
          <div className="grid grid-cols-2 gap-3">
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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cl-email">Email</Label>
              <Input id="cl-email" type="email" {...register('email')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cl-phone">Phone</Label>
              <Input id="cl-phone" type="tel" {...register('phone')} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cl-country">Country</Label>
              <Input id="cl-country" {...register('currentCountry')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cl-city">City</Label>
              <Input id="cl-city" {...register('currentCity')} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cl-source">Source</Label>
            <select
              id="cl-source"
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              {...register('source')}
            >
              <option value="DIRECT">Direct inquiry</option>
              <option value="REFERRAL">Referral</option>
              <option value="ADVERTISEMENT">Advertisement</option>
              <option value="EMPLOYER_REFERRAL">Employer referral</option>
              <option value="OTHER">Other</option>
            </select>
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
            <div className="space-y-2 rounded-md border border-amber-300/60 bg-amber-50/50 dark:bg-amber-950/20 p-3">
              <p className="text-xs font-medium text-amber-900 dark:text-amber-200">
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
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
              Create lead
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

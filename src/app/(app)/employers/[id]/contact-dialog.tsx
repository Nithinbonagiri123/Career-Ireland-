'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { type ReactElement, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { FormErrorAlert } from '@/components/form-error-alert';
import { FormField } from '@/components/form-field';
import { SubmitButton } from '@/components/submit-button';
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
import type { EmployerContact } from '@/lib/db/schema/recruitment';
import { useFormDialog } from '@/lib/hooks/use-form-dialog';
import {
  fetchPrimaryContactAction,
  upsertEmployerContactAction,
} from '@/modules/employers/actions';
import { describeContactEvent } from '@/modules/employers/contact-activity';
import { type UpsertContactInput, UpsertContactSchema } from '@/modules/employers/schemas';

type Props = { trigger: ReactElement; employerId: string; initial?: EmployerContact };

export function ContactDialog({ trigger, employerId, initial }: Props) {
  const isEdit = Boolean(initial);
  const form = useForm<UpsertContactInput>({
    resolver: zodResolver(UpsertContactSchema),
    defaultValues: {
      id: initial?.id,
      employerId,
      fullName: initial?.fullName ?? '',
      jobTitle: initial?.jobTitle ?? '',
      email: initial?.email ?? '',
      phone: initial?.phone ?? '',
      isPrimary: initial?.isPrimary ?? false,
    },
  });
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = form;
  // Each open starts blank (Add) or on the current record (Edit) — see useFormDialog.
  const { open, onOpenChange, formError, submit } = useFormDialog(form);

  // The employer's primary contact as the database has it now, fetched on
  // open so the "This replaces …" hint is never based on a stale page.
  const [currentPrimary, setCurrentPrimary] = useState<{ id: string; fullName: string } | null>(
    null,
  );
  const lookup = useRef(0);
  const handleOpenChange = (next: boolean) => {
    onOpenChange(next);
    if (!next) return;
    const ticket = ++lookup.current;
    setCurrentPrimary(null);
    void fetchPrimaryContactAction(employerId).then((r) => {
      if (r.ok && ticket === lookup.current) setCurrentPrimary(r.data);
    });
  };

  const wantsPrimary = useWatch({ control: form.control, name: 'isPrimary' });
  const replaces =
    wantsPrimary && currentPrimary && currentPrimary.id !== initial?.id ? currentPrimary : null;
  const dropsPrimary = isEdit && initial?.isPrimary && !wantsPrimary;

  const onSubmit = handleSubmit((data) =>
    submit(data, upsertEmployerContactAction, {
      // Same sentence as the Activity line, e.g.
      // "Bob Smith added as primary contact (replaced Alice Primary)".
      successMessage: (saved) =>
        describeContactEvent(
          isEdit ? 'UPDATED' : 'CREATED',
          initial ? { fullName: initial.fullName, isPrimary: initial.isPrimary } : null,
          { fullName: saved.fullName, isPrimary: saved.isPrimary },
          { replacedPrimary: saved.replacedPrimary },
        ),
    }),
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit contact' : 'Add contact'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <FormField id="c-name" label="Full name" error={errors.fullName?.message}>
            <Input id="c-name" aria-invalid={Boolean(errors.fullName)} {...register('fullName')} />
          </FormField>
          <FormField id="c-title" label="Job title">
            <Input id="c-title" {...register('jobTitle')} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField id="c-email" label="Email">
              <Input id="c-email" type="email" {...register('email')} />
            </FormField>
            <FormField id="c-phone" label="Phone">
              <Input id="c-phone" type="tel" {...register('phone')} />
            </FormField>
          </div>
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                {...register('isPrimary')}
                aria-describedby="c-primary-note"
                className="size-4 accent-accent"
              />
              Primary contact (only one primary per employer)
            </label>
            <p
              id="c-primary-note"
              aria-live="polite"
              data-testid="primary-replaces-note"
              className="pl-6 text-xs text-amber-700 empty:hidden dark:text-amber-400"
            >
              {replaces
                ? `This replaces ${replaces.fullName} as primary contact.`
                : dropsPrimary
                  ? 'The employer will have no primary contact.'
                  : ''}
            </p>
          </div>
          <FormErrorAlert error={formError} />
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <SubmitButton loading={isSubmitting}>{isEdit ? 'Save' : 'Add contact'}</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

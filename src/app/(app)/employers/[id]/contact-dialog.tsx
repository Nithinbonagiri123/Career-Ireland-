'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { ReactElement } from 'react';
import { useForm } from 'react-hook-form';
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
import { upsertEmployerContactAction } from '@/modules/employers/actions';
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
  const { open, onOpenChange, formError, submit } = useFormDialog(form);

  const onSubmit = handleSubmit((data) =>
    submit(data, upsertEmployerContactAction, {
      successMessage: isEdit ? 'Contact updated' : 'Contact added',
    }),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register('isPrimary')} className="size-4 accent-accent" />
            Primary contact (only one primary per employer)
          </label>
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

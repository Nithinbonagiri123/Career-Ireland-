'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { type ReactElement } from 'react';
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
import { Select } from '@/components/ui/select';
import type { DocumentType } from '@/lib/db/schema/reference';
import { useFormDialog } from '@/lib/hooks/use-form-dialog';
import { upsertDocumentTypeAction } from '@/modules/document-types/actions';
import {
  type UpsertDocumentTypeInput,
  UpsertDocumentTypeSchema,
} from '@/modules/document-types/schemas';

type Props = { trigger: ReactElement; initial?: DocumentType };

export function DocTypeDialog({ trigger, initial }: Props) {
  const isEdit = Boolean(initial);
  const form = useForm<UpsertDocumentTypeInput>({
    resolver: zodResolver(UpsertDocumentTypeSchema),
    defaultValues: {
      id: initial?.id,
      code: initial?.code ?? '',
      name: initial?.name ?? '',
      hasExpiry: initial?.hasExpiry ?? false,
      appliesTo: initial?.appliesTo ?? 'PERSON',
      isActive: initial?.isActive ?? true,
    },
  });
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = form;
  const { open, onOpenChange, formError, submit } = useFormDialog(form);

  const onSubmit = handleSubmit((data) =>
    submit(data, upsertDocumentTypeAction, {
      successMessage: isEdit ? 'Document type updated' : 'Document type added',
    }),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${initial?.code}` : 'Add document type'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="grid grid-cols-3 gap-3">
            <FormField id="dt-code" label="Code" error={errors.code?.message}>
              <Input
                id="dt-code"
                readOnly={isEdit}
                className={isEdit ? 'cursor-not-allowed opacity-60' : undefined}
                aria-invalid={Boolean(errors.code)}
                {...register('code')}
              />
            </FormField>
            <FormField
              id="dt-name"
              label="Name"
              error={errors.name?.message}
              className="col-span-2"
            >
              <Input id="dt-name" aria-invalid={Boolean(errors.name)} {...register('name')} />
            </FormField>
          </div>
          <FormField id="dt-applies" label="Applies to">
            <Select id="dt-applies" {...register('appliesTo')}>
              <option value="PERSON">Person only (candidate documents)</option>
              <option value="EMPLOYER">Employer only (company documents)</option>
              <option value="BOTH">Both</option>
            </Select>
          </FormField>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register('hasExpiry')} className="size-4 accent-accent" />
            Has expiry date (staff will be prompted for one on upload)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register('isActive')} className="size-4 accent-accent" />
            Active
          </label>
          <FormErrorAlert error={formError} />
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <SubmitButton loading={isSubmitting}>
              {isEdit ? 'Save' : 'Add document type'}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

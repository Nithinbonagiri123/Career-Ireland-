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
import type { OccupationCategory } from '@/lib/db/schema/occupations';
import { useFormDialog } from '@/lib/hooks/use-form-dialog';
import { upsertCategoryAction } from '@/modules/occupations/actions';
import { type UpsertCategoryInput, UpsertCategorySchema } from '@/modules/occupations/schemas';

type Props = { trigger: ReactElement; initial?: OccupationCategory };

export function CategoryDialog({ trigger, initial }: Props) {
  const isEdit = Boolean(initial);
  const form = useForm<UpsertCategoryInput>({
    resolver: zodResolver(UpsertCategorySchema),
    defaultValues: {
      id: initial?.id,
      name: initial?.name ?? '',
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
    submit(data, upsertCategoryAction, {
      successMessage: isEdit ? 'Category updated' : 'Category added',
    }),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit category' : 'Add category'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <FormField id="cat-name" label="Name" error={errors.name?.message}>
            <Input id="cat-name" aria-invalid={Boolean(errors.name)} {...register('name')} />
          </FormField>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register('isActive')} className="size-4 accent-accent" />
            Active
          </label>
          <FormErrorAlert error={formError} />
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <SubmitButton loading={isSubmitting}>{isEdit ? 'Save' : 'Add category'}</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

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
import { Textarea } from '@/components/ui/textarea';
import type { ServiceCategory } from '@/lib/db/schema/services';
import { useFormDialog } from '@/lib/hooks/use-form-dialog';
import { upsertServiceCategoryAction } from '@/modules/services-catalog/actions';
import {
  type UpsertServiceCategoryInput,
  UpsertServiceCategorySchema,
} from '@/modules/services-catalog/schemas';

type Props = {
  trigger: ReactElement;
  initial?: ServiceCategory;
};

/**
 * Session 34 — create or edit a business-line category. Slug auto-
 * derives from the name on save when left blank, so the operator can
 * ignore it in the common case ("just type the name").
 */
export function CategoryDialog({ trigger, initial }: Props) {
  const isEdit = Boolean(initial);
  const form = useForm<UpsertServiceCategoryInput>({
    resolver: zodResolver(UpsertServiceCategorySchema),
    defaultValues: {
      id: initial?.id,
      slug: initial?.slug ?? '',
      name: initial?.name ?? '',
      description: initial?.description ?? '',
      displayOrder: initial?.displayOrder ?? 100,
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
    submit(data, upsertServiceCategoryAction, {
      successMessage: isEdit ? 'Category updated' : 'Category added',
    }),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${initial?.name}` : 'Add category'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <FormField id="cat-name" label="Name" error={errors.name?.message}>
            <Input
              id="cat-name"
              placeholder="e.g. Immigration"
              aria-invalid={Boolean(errors.name)}
              {...register('name')}
            />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField
              id="cat-slug"
              label="Slug (optional)"
              hint="Auto-derived from the name if left blank. Lowercase letters, numbers, hyphens."
              error={errors.slug?.message}
            >
              <Input
                id="cat-slug"
                placeholder="e.g. immigration"
                aria-invalid={Boolean(errors.slug)}
                {...register('slug')}
              />
            </FormField>
            <FormField
              id="cat-order"
              label="Display order"
              hint="Lower = appears first. Ties broken alphabetically."
              error={errors.displayOrder?.message}
            >
              <Input
                id="cat-order"
                type="number"
                min={0}
                max={10000}
                {...register('displayOrder', {
                  setValueAs: (v) => (v === '' || v === null ? undefined : Number(v)),
                })}
              />
            </FormField>
          </div>
          <FormField
            id="cat-description"
            label="Description (optional)"
            error={errors.description?.message}
          >
            <Textarea
              id="cat-description"
              rows={2}
              placeholder="Short explanation of when this category applies."
              {...register('description')}
            />
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

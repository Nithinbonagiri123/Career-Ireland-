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
import { Select } from '@/components/ui/select';
import type { Currency } from '@/lib/db/schema/currencies';
import type { ServiceCatalogItem, ServiceCategory } from '@/lib/db/schema/services';
import { useFormDialog } from '@/lib/hooks/use-form-dialog';
import { upsertServiceItemAction } from '@/modules/services-catalog/actions';
import {
  type UpsertServiceItemInput,
  UpsertServiceItemSchema,
} from '@/modules/services-catalog/schemas';

type Props = {
  trigger: ReactElement;
  currencies: Currency[];
  /**
   * Session 34 — active categories to populate the Category dropdown.
   * Can be empty (page falls back to "— Uncategorised —" only), in
   * which case the admin needs to add categories from
   * /admin/service-categories first.
   */
  categories: ServiceCategory[];
  initial?: ServiceCatalogItem;
};

export function ServiceItemDialog({ trigger, currencies, categories, initial }: Props) {
  const isEdit = Boolean(initial);
  const form = useForm<UpsertServiceItemInput>({
    resolver: zodResolver(UpsertServiceItemSchema),
    defaultValues: {
      id: initial?.id,
      code: initial?.code ?? '',
      name: initial?.name ?? '',
      defaultCurrencyCode: initial?.defaultCurrencyCode ?? '',
      defaultPrice: initial?.defaultPrice ?? '',
      payerType: initial?.payerType ?? 'PERSON',
      categoryId: initial?.categoryId ?? '',
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
    submit(data, upsertServiceItemAction, {
      successMessage: isEdit ? 'Service updated' : 'Service added',
    }),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${initial?.code}` : 'Add service'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <FormField id="si-code" label="Code" error={errors.code?.message}>
              <Input
                id="si-code"
                readOnly={isEdit}
                className={isEdit ? 'cursor-not-allowed opacity-60' : undefined}
                aria-invalid={Boolean(errors.code)}
                {...register('code')}
              />
            </FormField>
            <FormField
              id="si-name"
              label="Name"
              error={errors.name?.message}
              className="col-span-2"
            >
              <Input id="si-name" aria-invalid={Boolean(errors.name)} {...register('name')} />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField id="si-currency" label="Default currency">
              <Select id="si-currency" {...register('defaultCurrencyCode')}>
                <option value="">— none —</option>
                {currencies
                  .filter((c) => c.isActive || c.code === initial?.defaultCurrencyCode)
                  .map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} — {c.name}
                    </option>
                  ))}
              </Select>
            </FormField>
            <FormField id="si-price" label="Default price">
              <Input id="si-price" type="text" inputMode="decimal" {...register('defaultPrice')} />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField id="si-payer" label="Payer type">
              <Select id="si-payer" {...register('payerType')}>
                <option value="PERSON">Person (candidate pays)</option>
                <option value="EMPLOYER">Employer (company pays)</option>
                <option value="ANY">Either</option>
              </Select>
            </FormField>
            <FormField
              id="si-category"
              label="Category"
              hint={
                categories.length === 0
                  ? 'Add categories from /admin/service-categories first.'
                  : 'Business line this service belongs to (optional).'
              }
            >
              <Select id="si-category" {...register('categoryId')}>
                <option value="">— Uncategorised —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                {/* Preserve the chosen category even if it was deactivated after this service was tagged. */}
                {initial?.categoryId && !categories.some((c) => c.id === initial.categoryId) && (
                  <option value={initial.categoryId}>Current (inactive)</option>
                )}
              </Select>
            </FormField>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register('isActive')} className="size-4 accent-accent" />
            Active
          </label>
          <FormErrorAlert error={formError} />
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <SubmitButton loading={isSubmitting}>{isEdit ? 'Save' : 'Add service'}</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

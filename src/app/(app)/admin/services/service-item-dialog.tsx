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
import type { Currency } from '@/lib/db/schema/currencies';
import type { ServiceCatalogItem } from '@/lib/db/schema/services';
import { useFormDialog } from '@/lib/hooks/use-form-dialog';
import { upsertServiceItemAction } from '@/modules/services-catalog/actions';
import {
  type UpsertServiceItemInput,
  UpsertServiceItemSchema,
} from '@/modules/services-catalog/schemas';

type Props = {
  trigger: ReactElement;
  currencies: Currency[];
  initial?: ServiceCatalogItem;
};

export function ServiceItemDialog({ trigger, currencies, initial }: Props) {
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
          <div className="grid grid-cols-3 gap-3">
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
          <FormField id="si-payer" label="Payer type">
            <Select id="si-payer" {...register('payerType')}>
              <option value="PERSON">Person (candidate pays)</option>
              <option value="EMPLOYER">Employer (company pays)</option>
              <option value="ANY">Either</option>
            </Select>
          </FormField>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register('isActive')} className="size-4 accent-accent" />
            Active
          </label>
          <FormErrorAlert error={formError} />
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <SubmitButton loading={isSubmitting}>
              {isEdit ? 'Save' : 'Add service'}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

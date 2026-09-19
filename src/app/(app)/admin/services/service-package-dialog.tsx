'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { type ReactElement, useState } from 'react';
import { useForm } from 'react-hook-form';
import { CatalogAutosuggest, type Selection } from '@/components/catalog-autosuggest';
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
import type { ServiceCatalogItem, ServicePackage } from '@/lib/db/schema/services';
import { useFormDialog } from '@/lib/hooks/use-form-dialog';
import {
  createServiceItemFromNameAction,
  upsertServicePackageAction,
} from '@/modules/services-catalog/actions';
import {
  type UpsertServicePackageInput,
  UpsertServicePackageSchema,
} from '@/modules/services-catalog/schemas';

type Props = {
  trigger: ReactElement;
  services: ServiceCatalogItem[];
  currencies: Currency[];
  initial?: ServicePackage;
};

export function ServicePackageDialog({ trigger, services, currencies, initial }: Props) {
  const isEdit = Boolean(initial);
  const form = useForm<UpsertServicePackageInput>({
    resolver: zodResolver(UpsertServicePackageSchema),
    defaultValues: {
      id: initial?.id,
      name: initial?.name ?? '',
      serviceCatalogItemId: initial?.serviceCatalogItemId ?? services[0]?.id ?? '',
      price: initial?.price ?? '',
      currencyCode: initial?.currencyCode ?? currencies.find((c) => c.isActive)?.code ?? '',
      isActive: initial?.isActive ?? true,
    },
  });
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = form;
  const { open, onOpenChange, formError, submit } = useFormDialog(form);

  const initialService = services.find(
    (s) => s.id === (initial?.serviceCatalogItemId ?? services[0]?.id),
  );
  const [serviceSelection, setServiceSelection] = useState<Selection>(
    initialService
      ? { kind: 'catalog', id: initialService.id, label: initialService.name }
      : null,
  );
  const [serviceOptions, setServiceOptions] = useState(() =>
    services.map((s) => ({ id: s.id, name: s.name, isActive: s.isActive })),
  );

  const onSubmit = handleSubmit((data) =>
    submit(data, upsertServicePackageAction, {
      successMessage: isEdit ? 'Package updated' : 'Package added',
    }),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit package' : 'Add package'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <FormField id="sp-name" label="Name" error={errors.name?.message}>
            <Input id="sp-name" aria-invalid={Boolean(errors.name)} {...register('name')} />
          </FormField>
          <FormField id="sp-service" label="Service">
            <input type="hidden" {...register('serviceCatalogItemId')} />
            <CatalogAutosuggest
              inputId="sp-service"
              options={serviceOptions}
              value={serviceSelection}
              onChange={(v) => {
                setServiceSelection(v);
                setValue('serviceCatalogItemId', v?.kind === 'catalog' ? v.id : '', {
                  shouldDirty: true,
                });
              }}
              placeholder="Type to search — or add a new service"
              createLabel="Add service"
              onCreateNew={async (name) => {
                const r = await createServiceItemFromNameAction({ name });
                if (!r.ok) throw new Error(r.error.message);
                setServiceOptions((prev) => [
                  ...prev,
                  { id: r.data.id, name: r.data.name, isActive: r.data.isActive },
                ]);
                return { id: r.data.id, label: r.data.name };
              }}
            />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField id="sp-price" label="Price" error={errors.price?.message}>
              <Input
                id="sp-price"
                inputMode="decimal"
                aria-invalid={Boolean(errors.price)}
                {...register('price')}
              />
            </FormField>
            <FormField id="sp-currency" label="Currency">
              <Select id="sp-currency" {...register('currencyCode')}>
                {currencies
                  .filter((c) => c.isActive || c.code === initial?.currencyCode)
                  .map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} — {c.symbol}
                    </option>
                  ))}
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
            <SubmitButton loading={isSubmitting}>
              {isEdit ? 'Save' : 'Add package'}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

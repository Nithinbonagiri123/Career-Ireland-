'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import type { Currency } from '@/lib/db/schema/currencies';
import type { Person } from '@/lib/db/schema/persons';
import type { ServiceCatalogItem } from '@/lib/db/schema/services';
import { useFormDialog } from '@/lib/hooks/use-form-dialog';
import { createEngagementAction } from '@/modules/commerce/actions';
import { type CreateEngagementInput, CreateEngagementSchema } from '@/modules/commerce/schemas';
import { createServiceItemFromNameAction } from '@/modules/services-catalog/actions';

type Props = {
  services: ServiceCatalogItem[];
  currencies: Currency[];
  persons: Person[];
};

export function CreateEngagementDialog({ services, currencies, persons }: Props) {
  const activeServices = useMemo(() => services.filter((s) => s.isActive), [services]);
  const activeCurrencies = useMemo(() => currencies.filter((c) => c.isActive), [currencies]);

  const form = useForm<CreateEngagementInput>({
    resolver: zodResolver(CreateEngagementSchema),
    defaultValues: {
      serviceCatalogItemId: activeServices[0]?.id ?? '',
      servicePackageId: '',
      payerMode: 'PERSON',
      payerPersonId: '',
      payerEmployerId: '',
      beneficiaryPersonId: '',
      agreedAmount: '',
      currencyCode:
        activeCurrencies.find((c) => c.code === 'ZAR')?.code ?? activeCurrencies[0]?.code ?? '',
      notes: '',
    },
  });
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = form;
  const { open, onOpenChange, formError, submit } = useFormDialog(form);

  const selectedServiceId = watch('serviceCatalogItemId');
  const payerMode = watch('payerMode');

  const initialService = activeServices.find((s) => s.id === selectedServiceId);
  const [serviceSelection, setServiceSelection] = useState<Selection>(
    initialService
      ? { kind: 'catalog', id: initialService.id, label: initialService.name }
      : null,
  );
  const [serviceOptions, setServiceOptions] = useState(() =>
    activeServices.map((s) => ({ id: s.id, name: s.name, isActive: s.isActive })),
  );

  useEffect(() => {
    const svc = activeServices.find((s) => s.id === selectedServiceId);
    if (svc?.defaultPrice) setValue('agreedAmount', svc.defaultPrice);
    if (svc?.defaultCurrencyCode) setValue('currencyCode', svc.defaultCurrencyCode);
  }, [selectedServiceId, activeServices, setValue]);

  const onSubmit = handleSubmit((data) =>
    submit(data, createEngagementAction, { successMessage: 'Engagement created' }),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button size="sm" disabled={activeServices.length === 0 || activeCurrencies.length === 0}>
            <Plus className="mr-1.5 size-4" /> New engagement
          </Button>
        }
      />
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New service engagement</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <FormField
            id="e-service"
            label="Service"
            hint={
              <>
                New services start with no default price — set it on the{' '}
                <a href="/admin/services" className="underline">
                  Services admin
                </a>{' '}
                page.
              </>
            }
          >
            <input type="hidden" {...register('serviceCatalogItemId')} />
            <CatalogAutosuggest
              inputId="e-service"
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

          <FormField id="e-payer-mode" label="Payer">
            <Select id="e-payer-mode" {...register('payerMode')}>
              <option value="PERSON">Person (candidate pays)</option>
              <option value="EMPLOYER" disabled>
                Employer (needs 5.9 — coming soon)
              </option>
            </Select>
          </FormField>

          {payerMode === 'PERSON' && (
            <FormField
              id="e-payer-person"
              label="Payer person"
              error={errors.payerPersonId?.message}
            >
              <Select
                id="e-payer-person"
                aria-invalid={Boolean(errors.payerPersonId)}
                {...register('payerPersonId')}
              >
                <option value="">— select person —</option>
                {persons.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.firstName} {p.lastName} — {p.email ?? p.phone ?? 'no contact'}
                  </option>
                ))}
              </Select>
            </FormField>
          )}

          <FormField id="e-beneficiary" label="Beneficiary (optional)">
            <Select id="e-beneficiary" {...register('beneficiaryPersonId')}>
              <option value="">— none —</option>
              {persons.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.firstName} {p.lastName}
                </option>
              ))}
            </Select>
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField
              id="e-amount"
              label="Agreed amount"
              error={errors.agreedAmount?.message}
            >
              <Input
                id="e-amount"
                inputMode="decimal"
                aria-invalid={Boolean(errors.agreedAmount)}
                {...register('agreedAmount')}
              />
            </FormField>
            <FormField id="e-currency" label="Currency">
              <Select id="e-currency" {...register('currencyCode')}>
                {activeCurrencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.symbol}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>

          <FormField id="e-notes" label="Notes">
            <Textarea id="e-notes" rows={3} {...register('notes')} />
          </FormField>

          <FormErrorAlert error={formError} />

          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <SubmitButton loading={isSubmitting}>Create engagement</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { motion } from 'framer-motion';
import { AlertCircle, Loader2, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
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
import { Label } from '@/components/ui/label';
import type { Currency } from '@/lib/db/schema/currencies';
import type { Person } from '@/lib/db/schema/persons';
import type { ServiceCatalogItem } from '@/lib/db/schema/services';
import { createEngagementAction } from '@/modules/commerce/actions';
import { type CreateEngagementInput, CreateEngagementSchema } from '@/modules/commerce/schemas';

type Props = {
  services: ServiceCatalogItem[];
  currencies: Currency[];
  persons: Person[];
};

export function CreateEngagementDialog({ services, currencies, persons }: Props) {
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const activeServices = useMemo(() => services.filter((s) => s.isActive), [services]);
  const activeCurrencies = useMemo(() => currencies.filter((c) => c.isActive), [currencies]);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateEngagementInput>({
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

  const selectedServiceId = watch('serviceCatalogItemId');
  const payerMode = watch('payerMode');

  // Auto-fill amount + currency from service defaults when service changes.
  useEffect(() => {
    const svc = activeServices.find((s) => s.id === selectedServiceId);
    if (svc?.defaultPrice) setValue('agreedAmount', svc.defaultPrice);
    if (svc?.defaultCurrencyCode) setValue('currencyCode', svc.defaultCurrencyCode);
  }, [selectedServiceId, activeServices, setValue]);

  const onSubmit = handleSubmit(async (data) => {
    setFormError(null);
    const result = await createEngagementAction(data);
    if (!result.ok) {
      setFormError(result.error.message);
      return;
    }
    toast.success('Engagement created');
    reset();
    setOpen(false);
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          reset();
          setFormError(null);
        }
      }}
    >
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
          <div className="space-y-1.5">
            <Label htmlFor="e-service">Service</Label>
            <select
              id="e-service"
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              {...register('serviceCatalogItemId')}
            >
              {activeServices.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="e-payer-mode">Payer</Label>
            <select
              id="e-payer-mode"
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              {...register('payerMode')}
            >
              <option value="PERSON">Person (candidate pays)</option>
              <option value="EMPLOYER" disabled>
                Employer (needs 5.9 — coming soon)
              </option>
            </select>
          </div>

          {payerMode === 'PERSON' && (
            <div className="space-y-1.5">
              <Label htmlFor="e-payer-person">Payer person</Label>
              <select
                id="e-payer-person"
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                aria-invalid={Boolean(errors.payerPersonId)}
                {...register('payerPersonId')}
              >
                <option value="">— select person —</option>
                {persons.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.firstName} {p.lastName} — {p.email ?? p.phone ?? 'no contact'}
                  </option>
                ))}
              </select>
              {errors.payerPersonId && (
                <p className="text-xs text-destructive">{errors.payerPersonId.message}</p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="e-beneficiary">Beneficiary (optional)</Label>
            <select
              id="e-beneficiary"
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              {...register('beneficiaryPersonId')}
            >
              <option value="">— none —</option>
              {persons.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.firstName} {p.lastName}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="e-amount">Agreed amount</Label>
              <Input
                id="e-amount"
                inputMode="decimal"
                aria-invalid={Boolean(errors.agreedAmount)}
                {...register('agreedAmount')}
              />
              {errors.agreedAmount && (
                <p className="text-xs text-destructive">{errors.agreedAmount.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="e-currency">Currency</Label>
              <select
                id="e-currency"
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                {...register('currencyCode')}
              >
                {activeCurrencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.symbol}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="e-notes">Notes</Label>
            <textarea
              id="e-notes"
              rows={3}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              {...register('notes')}
            />
          </div>

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
              Create engagement
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

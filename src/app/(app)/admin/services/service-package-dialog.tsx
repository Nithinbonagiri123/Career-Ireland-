'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { motion } from 'framer-motion';
import { AlertCircle, Loader2 } from 'lucide-react';
import { type ReactElement, useState } from 'react';
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
import type { ServiceCatalogItem, ServicePackage } from '@/lib/db/schema/services';
import { upsertServicePackageAction } from '@/modules/services-catalog/actions';
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
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const isEdit = Boolean(initial);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<UpsertServicePackageInput>({
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

  const onSubmit = handleSubmit(async (data) => {
    setFormError(null);
    const result = await upsertServicePackageAction(data);
    if (!result.ok) {
      setFormError(result.error.message);
      return;
    }
    toast.success(isEdit ? 'Package updated' : 'Package added');
    reset(data);
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
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit package' : 'Add package'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="sp-name">Name</Label>
            <Input id="sp-name" aria-invalid={Boolean(errors.name)} {...register('name')} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sp-service">Service</Label>
            <select
              id="sp-service"
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              {...register('serviceCatalogItemId')}
            >
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sp-price">Price</Label>
              <Input
                id="sp-price"
                inputMode="decimal"
                aria-invalid={Boolean(errors.price)}
                {...register('price')}
              />
              {errors.price && <p className="text-xs text-destructive">{errors.price.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sp-currency">Currency</Label>
              <select
                id="sp-currency"
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                {...register('currencyCode')}
              >
                {currencies
                  .filter((c) => c.isActive || c.code === initial?.currencyCode)
                  .map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} — {c.symbol}
                    </option>
                  ))}
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register('isActive')} className="size-4 accent-accent" />
            Active
          </label>
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
              {isEdit ? 'Save' : 'Add package'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

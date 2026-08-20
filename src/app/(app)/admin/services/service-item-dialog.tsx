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
import type { ServiceCatalogItem } from '@/lib/db/schema/services';
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
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const isEdit = Boolean(initial);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<UpsertServiceItemInput>({
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

  const onSubmit = handleSubmit(async (data) => {
    setFormError(null);
    const result = await upsertServiceItemAction(data);
    if (!result.ok) {
      setFormError(result.error.message);
      return;
    }
    toast.success(isEdit ? 'Service updated' : 'Service added');
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
          <DialogTitle>{isEdit ? `Edit ${initial?.code}` : 'Add service'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="si-code">Code</Label>
              <Input
                id="si-code"
                readOnly={isEdit}
                className={isEdit ? 'cursor-not-allowed opacity-60' : undefined}
                aria-invalid={Boolean(errors.code)}
                {...register('code')}
              />
              {errors.code && <p className="text-xs text-destructive">{errors.code.message}</p>}
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="si-name">Name</Label>
              <Input id="si-name" aria-invalid={Boolean(errors.name)} {...register('name')} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="si-currency">Default currency</Label>
              <select
                id="si-currency"
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                {...register('defaultCurrencyCode')}
              >
                <option value="">— none —</option>
                {currencies
                  .filter((c) => c.isActive || c.code === initial?.defaultCurrencyCode)
                  .map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} — {c.name}
                    </option>
                  ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="si-price">Default price</Label>
              <Input id="si-price" type="text" inputMode="decimal" {...register('defaultPrice')} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="si-payer">Payer type</Label>
            <select
              id="si-payer"
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              {...register('payerType')}
            >
              <option value="PERSON">Person (candidate pays)</option>
              <option value="EMPLOYER">Employer (company pays)</option>
              <option value="ANY">Either</option>
            </select>
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
              {isEdit ? 'Save' : 'Add service'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Currency } from '@/lib/db/schema/currencies';
import { upsertCurrencyAction } from '@/modules/currencies/actions';
import { type UpsertCurrencyInput, UpsertCurrencySchema } from '@/modules/currencies/schemas';

type Props = {
  trigger: ReactElement;
  initial?: Currency;
};

export function CurrencyDialog({ trigger, initial }: Props) {
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const isEdit = Boolean(initial);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<UpsertCurrencyInput>({
    resolver: zodResolver(UpsertCurrencySchema),
    defaultValues: {
      code: initial?.code ?? '',
      name: initial?.name ?? '',
      symbol: initial?.symbol ?? '',
      isActive: initial?.isActive ?? true,
    },
  });

  const onSubmit = handleSubmit(async (data) => {
    setFormError(null);
    const result = await upsertCurrencyAction(data);
    if (!result.ok) {
      setFormError(result.error.message);
      return;
    }
    toast.success(isEdit ? `Updated ${result.data.code}` : `Added ${result.data.code}`);
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
          <DialogTitle>{isEdit ? `Edit ${initial?.code}` : 'Add currency'}</DialogTitle>
          <DialogDescription>
            ISO 4217 code (3 uppercase letters). Every money field references this table.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cu-code">Code</Label>
              <Input
                id="cu-code"
                maxLength={3}
                readOnly={isEdit}
                className={isEdit ? 'cursor-not-allowed opacity-60' : undefined}
                aria-invalid={Boolean(errors.code)}
                {...register('code')}
              />
              {errors.code && <p className="text-xs text-destructive">{errors.code.message}</p>}
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="cu-name">Name</Label>
              <Input id="cu-name" aria-invalid={Boolean(errors.name)} {...register('name')} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cu-symbol">Symbol</Label>
            <Input
              id="cu-symbol"
              maxLength={5}
              aria-invalid={Boolean(errors.symbol)}
              {...register('symbol')}
            />
            {errors.symbol && <p className="text-xs text-destructive">{errors.symbol.message}</p>}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register('isActive')} className="size-4 accent-accent" />
            Active (selectable in dropdowns)
          </label>

          {formError && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
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
              {isEdit ? 'Save changes' : 'Add currency'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

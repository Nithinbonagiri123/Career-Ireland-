'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { type ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { FormErrorAlert } from '@/components/form-error-alert';
import { FormField } from '@/components/form-field';
import { SubmitButton } from '@/components/submit-button';
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
import type { Currency } from '@/lib/db/schema/currencies';
import { useFormDialog } from '@/lib/hooks/use-form-dialog';
import { upsertCurrencyAction } from '@/modules/currencies/actions';
import { type UpsertCurrencyInput, UpsertCurrencySchema } from '@/modules/currencies/schemas';

type Props = {
  trigger: ReactElement;
  initial?: Currency;
};

export function CurrencyDialog({ trigger, initial }: Props) {
  const isEdit = Boolean(initial);
  const form = useForm<UpsertCurrencyInput>({
    resolver: zodResolver(UpsertCurrencySchema),
    defaultValues: {
      code: initial?.code ?? '',
      name: initial?.name ?? '',
      symbol: initial?.symbol ?? '',
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
    submit(data, upsertCurrencyAction, {
      // Base success — augmented below with the code so operators know which row.
      successMessage: isEdit ? 'Currency updated' : 'Currency added',
      onSuccess: (row) =>
        toast.success(isEdit ? `Updated ${row.code}` : `Added ${row.code}`),
    }),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
            <FormField id="cu-code" label="Code" error={errors.code?.message}>
              <Input
                id="cu-code"
                maxLength={3}
                readOnly={isEdit}
                className={isEdit ? 'cursor-not-allowed opacity-60' : undefined}
                aria-invalid={Boolean(errors.code)}
                {...register('code')}
              />
            </FormField>
            <FormField
              id="cu-name"
              label="Name"
              error={errors.name?.message}
              className="col-span-2"
            >
              <Input id="cu-name" aria-invalid={Boolean(errors.name)} {...register('name')} />
            </FormField>
          </div>

          <FormField id="cu-symbol" label="Symbol" error={errors.symbol?.message}>
            <Input
              id="cu-symbol"
              maxLength={5}
              aria-invalid={Boolean(errors.symbol)}
              {...register('symbol')}
            />
          </FormField>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register('isActive')} className="size-4 accent-accent" />
            Active (selectable in dropdowns)
          </label>

          <FormErrorAlert error={formError} />

          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <SubmitButton loading={isSubmitting}>
              {isEdit ? 'Save changes' : 'Add currency'}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { motion } from 'framer-motion';
import { AlertCircle, Loader2, Plus } from 'lucide-react';
import { useState } from 'react';
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
import { recordPaymentAction } from '@/modules/commerce/actions';
import type { EngagementListRow } from '@/modules/commerce/repository';
import { type RecordPaymentInput, RecordPaymentSchema } from '@/modules/commerce/schemas';

export function RecordPaymentDialog({ engagements }: { engagements: EngagementListRow[] }) {
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const openEngagements = engagements.filter(
    (e) => e.status !== 'CANCELLED' && e.status !== 'COMPLETED',
  );

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RecordPaymentInput>({
    resolver: zodResolver(RecordPaymentSchema),
    defaultValues: {
      serviceEngagementId: openEngagements[0]?.id ?? '',
      amount: openEngagements[0]?.agreedAmount ?? '',
      currencyCode: openEngagements[0]?.currencyCode ?? '',
      method: 'BANK_TRANSFER',
      proofReference: '',
      receivedAt: '',
    },
  });

  // On engagement change, populate amount and currency from selected engagement.
  const selectedEngagementId = watch('serviceEngagementId');
  const selectedEngagement = openEngagements.find((e) => e.id === selectedEngagementId);

  const onSubmit = handleSubmit(async (data) => {
    setFormError(null);
    const result = await recordPaymentAction(data);
    if (!result.ok) {
      setFormError(result.error.message);
      return;
    }
    toast.success('Payment recorded');
    reset();
    setOpen(false);
  });

  const onEngagementSelect = (id: string) => {
    setValue('serviceEngagementId', id);
    const e = openEngagements.find((x) => x.id === id);
    if (e) {
      setValue('amount', e.agreedAmount);
      setValue('currencyCode', e.currencyCode);
    }
  };

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
          <Button size="sm" disabled={openEngagements.length === 0}>
            <Plus className="mr-1.5 size-4" /> Record payment
          </Button>
        }
      />
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Record a payment</DialogTitle>
          <DialogDescription>
            Payments are attached to a Service Engagement. Adding a reference marks the payment as
            "proof uploaded" — an ADMIN can then verify or reject.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="p-engagement">Engagement</Label>
            <select
              id="p-engagement"
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              value={selectedEngagementId}
              onChange={(e) => onEngagementSelect(e.target.value)}
            >
              {openEngagements.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.serviceName} — {e.payerLabel} — {e.agreedAmount} {e.currencyCode}
                </option>
              ))}
            </select>
            {selectedEngagement && (
              <p className="text-xs text-muted-foreground">
                Agreed {selectedEngagement.agreedAmount} {selectedEngagement.currencyCode} · status{' '}
                {selectedEngagement.status.replace(/_/g, ' ')}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="p-amount">Amount</Label>
              <Input
                id="p-amount"
                inputMode="decimal"
                aria-invalid={Boolean(errors.amount)}
                {...register('amount')}
              />
              {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-currency">Currency</Label>
              <Input
                id="p-currency"
                maxLength={3}
                readOnly
                className="uppercase opacity-60"
                {...register('currencyCode')}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="p-method">Method</Label>
              <select
                id="p-method"
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                {...register('method')}
              >
                <option value="BANK_TRANSFER">Bank transfer</option>
                <option value="CASH">Cash</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-received">Received on</Label>
              <Input id="p-received" type="date" {...register('receivedAt')} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="p-ref">Proof reference (bank statement id / cash receipt #)</Label>
            <Input
              id="p-ref"
              placeholder="Optional — file uploads land in 5.7"
              {...register('proofReference')}
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
              Record payment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { formatMoney } from '@/components/ds/money';
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
import { Select } from '@/components/ui/select';
import { useFormDialog } from '@/lib/hooks/use-form-dialog';
import { recordPaymentAction } from '@/modules/commerce/actions';
import type { EngagementListRow } from '@/modules/commerce/repository';
import { type RecordPaymentInput, RecordPaymentSchema } from '@/modules/commerce/schemas';

export function RecordPaymentDialog({ engagements }: { engagements: EngagementListRow[] }) {
  const openEngagements = engagements.filter(
    (e) =>
      e.status !== 'CANCELLED' &&
      e.status !== 'COMPLETED' &&
      // Stage B Wave 4 — complimentary services owe nothing; the server
      // refuses payments on them, so don't offer them here.
      !e.hasComplimentaryInvoice,
  );

  const form = useForm<RecordPaymentInput>({
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
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = form;
  const { open, onOpenChange, formError, submit } = useFormDialog(form);

  const selectedEngagementId = watch('serviceEngagementId');
  const selectedEngagement = openEngagements.find((e) => e.id === selectedEngagementId);

  // ADMIN / FINANCE record payments after confirming the money arrived,
  // so recordPayment now auto-verifies for them on the server side
  // (receipt issued, engagement advanced to ACTIVE, invoice recomputed).
  // Toast reflects that so the user doesn't go looking for a Verify step
  // that no longer applies.
  const onSubmit = handleSubmit((data) =>
    submit(data, recordPaymentAction, { successMessage: 'Payment recorded and verified' }),
  );

  const onEngagementSelect = (id: string) => {
    setValue('serviceEngagementId', id);
    const e = openEngagements.find((x) => x.id === id);
    if (e) {
      setValue('amount', e.agreedAmount);
      setValue('currencyCode', e.currencyCode);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            className="w-full justify-center"
            disabled={openEngagements.length === 0}
          >
            <Plus className="mr-1.5 size-4" aria-hidden /> Record payment
          </Button>
        }
      />
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Record a payment</DialogTitle>
          <DialogDescription>
            Payments are attached to a service. Adding a reference marks the payment as "proof
            uploaded" — an ADMIN can then verify or reject.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <FormField
            id="p-engagement"
            label="Service"
            hint={
              selectedEngagement
                ? `Agreed ${formatMoney(selectedEngagement.agreedAmount, selectedEngagement.currencyCode)} · status ${selectedEngagement.status.replace(/_/g, ' ')}`
                : undefined
            }
          >
            <Select
              id="p-engagement"
              value={selectedEngagementId}
              onChange={(e) => onEngagementSelect(e.target.value)}
            >
              {openEngagements.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.serviceName} — {e.payerLabel} — {formatMoney(e.agreedAmount, e.currencyCode)}
                </option>
              ))}
            </Select>
          </FormField>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField id="p-amount" label="Amount" error={errors.amount?.message}>
              <Input
                id="p-amount"
                inputMode="decimal"
                aria-invalid={Boolean(errors.amount)}
                {...register('amount')}
              />
            </FormField>
            <FormField id="p-currency" label="Currency">
              <Input
                id="p-currency"
                maxLength={3}
                readOnly
                className="uppercase opacity-60"
                {...register('currencyCode')}
              />
            </FormField>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField id="p-method" label="Method">
              <Select id="p-method" {...register('method')}>
                <option value="BANK_TRANSFER">Bank transfer</option>
                <option value="CASH">Cash</option>
                <option value="OTHER">Other</option>
              </Select>
            </FormField>
            <FormField id="p-received" label="Received on">
              <Input id="p-received" type="date" {...register('receivedAt')} />
            </FormField>
          </div>

          <FormField id="p-ref" label="Proof reference (bank statement id / cash receipt #)">
            <Input id="p-ref" placeholder="Optional" {...register('proofReference')} />
          </FormField>

          <FormErrorAlert error={formError} />

          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <SubmitButton loading={isSubmitting}>Record payment</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

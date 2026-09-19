'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
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
import { Select } from '@/components/ui/select';
import { recordPaymentAction, verifyPaymentAction } from '@/modules/commerce/actions';
import { type RecordPaymentInput, RecordPaymentSchema } from '@/modules/commerce/schemas';

type InvoiceHandle = {
  id: string;
  number: string;
  serviceEngagementId: string;
  totalAmount: string;
  currencyCode: string;
};

/**
 * Record a payment against a specific invoice, right from the Billing
 * tab. Pre-fills amount + currency from the invoice and locks the
 * engagement — the operator only chooses method, receipt date and an
 * optional reference.
 *
 * If the current user is ADMIN or FINANCE (`canVerify`), they can also
 * tick "Mark verified now" — the client fires a follow-up verify call,
 * which the server pipeline turns into an auto-issued receipt + invoice
 * PAID flip inside one transaction (see modules/commerce/service.ts).
 * Anyone else records a PENDING payment; ADMIN/FINANCE flip it later
 * from /payments.
 */
export function RecordInvoicePaymentDialog({
  invoice,
  canVerify,
}: {
  invoice: InvoiceHandle;
  canVerify: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [verifyNow, setVerifyNow] = useState(canVerify);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RecordPaymentInput>({
    resolver: zodResolver(RecordPaymentSchema),
    defaultValues: {
      serviceEngagementId: invoice.serviceEngagementId,
      amount: invoice.totalAmount,
      currencyCode: invoice.currencyCode,
      method: 'BANK_TRANSFER',
      proofReference: '',
      receivedAt: new Date().toISOString().slice(0, 10),
    },
  });

  const onSubmit = handleSubmit(async (data) => {
    setFormError(null);
    const rec = await recordPaymentAction(data);
    if (!rec.ok) {
      setFormError(rec.error.message);
      return;
    }

    if (canVerify && verifyNow) {
      const ver = await verifyPaymentAction({ paymentId: rec.data.id });
      if (!ver.ok) {
        // Payment recorded but verify failed — surface both so the
        // operator knows the row is sitting in PENDING and can retry
        // from /payments.
        toast.warning(
          `Payment recorded (PENDING) — verify failed: ${ver.error.message}. Verify from /payments.`,
        );
        reset();
        setOpen(false);
        router.refresh();
        return;
      }
      toast.success(`Payment verified — receipt issued for ${invoice.number}`);
    } else {
      toast.success(`Payment recorded for ${invoice.number} (awaiting verification)`);
    }

    reset();
    setOpen(false);
    router.refresh();
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          reset();
          setFormError(null);
          setVerifyNow(canVerify);
        }
      }}
    >
      <DialogTrigger
        render={
          <Button size="sm" variant="outline">
            Record payment
          </Button>
        }
      />
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record payment for {invoice.number}</DialogTitle>
          <DialogDescription>
            Amount defaults to the invoice total; edit if the payer sent a partial payment.
            {canVerify
              ? ' Ticking "Mark verified" issues the receipt right now.'
              : ' An ADMIN or FINANCE role will verify + issue the receipt after this is recorded.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <input type="hidden" {...register('serviceEngagementId')} />

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rp-amount">Amount</Label>
              <Input
                id="rp-amount"
                inputMode="decimal"
                aria-invalid={Boolean(errors.amount)}
                {...register('amount')}
              />
              {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rp-currency">Currency</Label>
              <Input
                id="rp-currency"
                maxLength={3}
                readOnly
                className="uppercase opacity-60"
                {...register('currencyCode')}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rp-method">Method</Label>
              <Select id="rp-method" {...register('method')}>
                <option value="BANK_TRANSFER">Bank transfer</option>
                <option value="CASH">Cash</option>
                <option value="OTHER">Other</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rp-received">Received on</Label>
              <Input id="rp-received" type="date" {...register('receivedAt')} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rp-ref">Reference (optional)</Label>
            <Input
              id="rp-ref"
              placeholder="Bank statement id / cash receipt #"
              {...register('proofReference')}
            />
          </div>

          {canVerify && (
            <label className="flex items-start gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={verifyNow}
                onChange={(e) => setVerifyNow(e.target.checked)}
                className="mt-0.5 size-4 accent-primary"
              />
              <span className="flex-1">
                <span className="flex items-center gap-1.5 font-medium">
                  <CheckCircle2 className="size-3.5 text-status-success" />
                  Mark verified now
                </span>
                <span className="text-xs text-muted-foreground">
                  Issues the receipt and flips the invoice to PAID in one transaction.
                </span>
              </span>
            </label>
          )}

          {formError && (
            <div
              className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
              role="alert"
            >
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
              {canVerify && verifyNow ? 'Record + verify' : 'Record payment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

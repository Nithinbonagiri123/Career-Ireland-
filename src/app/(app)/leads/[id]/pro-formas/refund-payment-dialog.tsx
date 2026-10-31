'use client';

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useMemo, useState, useTransition } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { issuePreIssuanceRefundAction } from '@/modules/proformas/actions';

/**
 * Finance-authorised pre-issuance refund dialog. Reuses the Stage 4.1
 * refund service via `issuePreIssuanceRefundAction`.
 *
 * ── Idempotency ──────────────────────────────────────────────────────
 * A unique key is generated once per dialog open and sent to the server.
 * If the operator double-clicks the submit button or retries after a
 * network blip, the service returns the existing refund row — no
 * second payment is created. The key resets when the dialog closes
 * so a fresh refund request on the same payment uses a new slot.
 *
 * ── Guards ───────────────────────────────────────────────────────────
 * The server enforces: role (ADMIN/FINANCE), pro-forma status
 * (ACCEPTED), payment status (VERIFIED/PARTIALLY_REFUNDED), amount
 * within the remaining envelope, idempotency key uniqueness. The UI
 * shows amount defaulted to the payment total so partial refunds
 * are explicit (operator must change it).
 */
export function RefundPaymentButton({
  paymentId,
  paymentAmount,
  currencyCode,
}: {
  paymentId: string;
  /** Original payment amount, used as the dialog's default + max hint. */
  paymentAmount: string;
  currencyCode: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const dialogSeed = useId();
  // Fresh idempotency key each time the dialog mounts. The React useId
  // seed is per-component-instance; combine with mount timestamp so a
  // repeat open after close gets a new key.
  const idempotencyKey = useMemo(
    () => `${dialogSeed}-${open ? Date.now() : ''}`,
    [dialogSeed, open],
  );

  const [amount, setAmount] = useState(paymentAmount);
  const [method, setMethod] = useState<'BANK_TRANSFER' | 'CASH' | 'OTHER'>('BANK_TRANSFER');
  const [reason, setReason] = useState('');
  const [reference, setReference] = useState('');
  const [confirmChecked, setConfirmChecked] = useState(false);

  function reset() {
    setAmount(paymentAmount);
    setMethod('BANK_TRANSFER');
    setReason('');
    setReference('');
    setConfirmChecked(false);
  }

  function submit() {
    const amt = Number.parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error('Amount must be a positive number');
      return;
    }
    if (amt > Number.parseFloat(paymentAmount) + 0.005) {
      toast.error(
        `Amount cannot exceed the payment total ${paymentAmount} ${currencyCode}. The server also enforces this.`,
      );
      return;
    }
    if (reason.trim().length < 3) {
      toast.error('Reason is required (min 3 characters)');
      return;
    }
    if (!confirmChecked) {
      toast.error('Please confirm the refund before submitting');
      return;
    }
    startTransition(async () => {
      const r = await issuePreIssuanceRefundAction({
        paymentId,
        amount,
        method,
        reason: reason.trim(),
        reference: reference.trim() || undefined,
        idempotencyKey,
      });
      if (r.ok) {
        toast.success(
          `Refund issued: ${amount} ${currencyCode}. Payment is now ${r.data.paymentStatusAfter.toLowerCase().replace('_', ' ')}.`,
        );
        setOpen(false);
        reset();
        router.refresh();
      } else {
        toast.error(r.error.message);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger
        render={
          <Button size="sm" variant="outline" className="text-destructive">
            Refund
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Refund payment</DialogTitle>
          <DialogDescription>
            Returns funds for a verified payment before any official invoice has been issued. Marks
            the payment as partially refunded or refunded and reduces the pro forma&apos;s paid
            balance accordingly. Finance only — the action is audited.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="refund-amount">
                Amount ({currencyCode})
                <span className="ml-1 text-xs text-muted-foreground">max {paymentAmount}</span>
              </Label>
              <Input
                id="refund-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="refund-method">Method</Label>
              <Select
                id="refund-method"
                value={method}
                onChange={(e) => setMethod(e.target.value as 'BANK_TRANSFER' | 'CASH' | 'OTHER')}
              >
                <option value="BANK_TRANSFER">Bank transfer</option>
                <option value="CASH">Cash</option>
                <option value="OTHER">Other</option>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="refund-ref">
              Refund reference{' '}
              <span className="text-xs text-muted-foreground">(bank line / cash slip)</span>
            </Label>
            <Input
              id="refund-ref"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="BANK-REF-20261018-001"
              maxLength={500}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="refund-reason">Reason (audited)</Label>
            <Textarea
              id="refund-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Client cancelled service after €200 deposit; refund per policy."
              maxLength={500}
            />
          </div>
          <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-xs dark:border-amber-500/30 dark:bg-amber-950/30">
            <input
              type="checkbox"
              checked={confirmChecked}
              onChange={(e) => setConfirmChecked(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-sky-600"
            />
            <span>
              I confirm this refund is authorised by Finance. The payment record is NOT deleted; the
              refund is recorded against it and a matching ledger reversal is posted.
            </span>
          </label>
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" type="button" disabled={pending} />}>
            Cancel
          </DialogClose>
          <Button
            type="button"
            variant="destructive"
            onClick={submit}
            disabled={pending || !confirmChecked}
          >
            {pending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Issue refund
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

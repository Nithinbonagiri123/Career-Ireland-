'use client';

import { AlertCircle, Loader2, Undo2 } from 'lucide-react';
import { useMemo, useState } from 'react';
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
import { issueRefundAction } from '@/modules/billing/actions';

export type RefundablePayment = {
  id: string;
  amount: string;
  currencyCode: string;
  method: 'BANK_TRANSFER' | 'CASH' | 'OTHER';
  verifiedAt: Date | null;
  /** Remaining refundable = payment.amount − sum(prior refunds). */
  remainingRefundable: string;
};

/**
 * "Issue refund" control on the invoice print page. Shows a dialog that
 * walks the operator through refunding a specific verified payment.
 *
 * The server auto-issues a credit note alongside the refund (the legal
 * VAT reversal). The operator doesn't have to issue the credit note by
 * hand — refund = credit note + money movement + payment status flip,
 * all in one audited step.
 *
 * See docs/ux-audit-blueprint.md §7.1 for the operational rationale.
 */
export function IssueRefundControls({
  invoiceNumber,
  profileHref,
  refundablePayments,
}: {
  invoiceNumber: string;
  profileHref: string;
  refundablePayments: RefundablePayment[];
}) {
  const [open, setOpen] = useState(false);
  const [paymentId, setPaymentId] = useState(refundablePayments[0]?.id ?? '');
  const selectedPayment = useMemo(
    () => refundablePayments.find((p) => p.id === paymentId) ?? refundablePayments[0] ?? null,
    [paymentId, refundablePayments],
  );
  const [amount, setAmount] = useState(selectedPayment?.remainingRefundable ?? '');
  const [method, setMethod] = useState<'BANK_TRANSFER' | 'CASH' | 'OTHER'>(
    selectedPayment?.method ?? 'BANK_TRANSFER',
  );
  const [reason, setReason] = useState('');
  const [reference, setReference] = useState('');
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reset = () => {
    const first = refundablePayments[0] ?? null;
    setPaymentId(first?.id ?? '');
    setAmount(first?.remainingRefundable ?? '');
    setMethod(first?.method ?? 'BANK_TRANSFER');
    setReason('');
    setReference('');
    setErr(null);
    setPending(false);
  };

  const onPaymentChange = (id: string) => {
    const p = refundablePayments.find((x) => x.id === id);
    if (!p) return;
    setPaymentId(id);
    setAmount(p.remainingRefundable);
    setMethod(p.method);
  };

  const submit = async () => {
    setErr(null);
    if (!paymentId) {
      setErr('Pick a payment to refund.');
      return;
    }
    if (!/^\d+(\.\d{1,2})?$/.test(amount)) {
      setErr('Amount must be a decimal like 150 or 150.00');
      return;
    }
    if (reason.trim().length < 3) {
      setErr('Please enter a reason of at least 3 characters.');
      return;
    }
    setPending(true);
    const r = await issueRefundAction({
      paymentId,
      invoiceNumber,
      profileHref,
      amount,
      method,
      reason,
      reference: reference || undefined,
    });
    setPending(false);
    if (!r.ok) {
      setErr(r.error.message);
      return;
    }
    toast.success(
      `Refund recorded. Credit note ${r.data.creditNoteNumber} issued; payment now ${r.data.paymentStatusAfter.replace('_', ' ').toLowerCase()}.`,
    );
    reset();
    setOpen(false);
  };

  if (refundablePayments.length === 0) return null;

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
          <Button variant="outline" size="sm">
            <Undo2 className="mr-1.5 size-4" />
            Issue refund
          </Button>
        }
      />
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Issue refund against {invoiceNumber}</DialogTitle>
          <DialogDescription>
            Returns money to the payer. A credit note is issued automatically for the VAT reversal,
            and the payment status flips to Partially refunded or Refunded. The money movement still
            has to be made by hand (bank transfer / cash) — this record keeps the CRM in sync.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {refundablePayments.length > 1 && (
            <div className="space-y-1.5">
              <Label htmlFor="rf-payment">Which payment?</Label>
              <Select
                id="rf-payment"
                value={paymentId}
                onChange={(e) => onPaymentChange(e.target.value)}
              >
                {refundablePayments.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.amount} {p.currencyCode} · {p.method.replace('_', ' ').toLowerCase()} ·
                    verified {p.verifiedAt ? p.verifiedAt.toLocaleDateString() : '—'} ·{' '}
                    {p.remainingRefundable} refundable
                  </option>
                ))}
              </Select>
            </div>
          )}

          {selectedPayment && (
            <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
              <div className="flex items-center justify-between">
                <span>Original amount</span>
                <span className="font-mono text-foreground">
                  {selectedPayment.amount} {selectedPayment.currencyCode}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Already refunded</span>
                <span className="font-mono">
                  {(
                    Number.parseFloat(selectedPayment.amount) -
                    Number.parseFloat(selectedPayment.remainingRefundable)
                  ).toFixed(2)}{' '}
                  {selectedPayment.currencyCode}
                </span>
              </div>
              <div className="flex items-center justify-between font-medium text-foreground">
                <span>Remaining refundable</span>
                <span className="font-mono">
                  {selectedPayment.remainingRefundable} {selectedPayment.currencyCode}
                </span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rf-amount">Refund amount ({selectedPayment?.currencyCode})</Label>
              <Input
                id="rf-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={selectedPayment?.remainingRefundable}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rf-method">Method</Label>
              <Select
                id="rf-method"
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
            <Label htmlFor="rf-reason">Reason (audited)</Label>
            <Textarea
              id="rf-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Service cancelled before delivery; duplicate payment received"
              maxLength={500}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rf-ref">Reference (optional)</Label>
            <Input
              id="rf-ref"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Bank statement row ID, cash slip number…"
              maxLength={200}
            />
          </div>

          {err && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
              <span>{err}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" type="button" disabled={pending} />}>
            Cancel
          </DialogClose>
          <Button onClick={submit} disabled={pending}>
            {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Record refund
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

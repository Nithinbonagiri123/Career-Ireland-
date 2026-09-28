'use client';

import { AlertCircle, Loader2, ReceiptText } from 'lucide-react';
import { useState } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { issueCreditNoteAction } from '@/modules/billing/actions';

/**
 * "Issue credit note" control on the invoice print page. Gated at the
 * server (ADMIN/FINANCE only) — this component just renders whenever
 * the parent decides to show it. The dialog collects amount + reason,
 * then calls issueCreditNoteAction which writes the credit_note row,
 * recomputes invoice status (may flip PAID → PARTIALLY_PAID), and
 * audits the whole thing.
 *
 * Outstanding balance is passed in for the placeholder + validation
 * hint. The server still enforces the hard cap.
 */
export function CreditNoteControls({
  invoiceId,
  invoiceNumber,
  profileHref,
  currencyCode,
  maxCreditAmount,
}: {
  invoiceId: string;
  invoiceNumber: string;
  profileHref: string;
  currencyCode: string;
  /** invoice.total_amount minus already-credited amount, as a decimal
   *  string. The dialog uses this as the max hint + default value. */
  maxCreditAmount: string;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(maxCreditAmount);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const reset = () => {
    setAmount(maxCreditAmount);
    setReason('');
    setFormError(null);
    setPending(false);
  };

  const submit = async () => {
    setFormError(null);
    if (!/^\d+(\.\d{1,2})?$/.test(amount)) {
      setFormError('Amount must be a decimal like 150 or 150.00');
      return;
    }
    if (reason.trim().length < 3) {
      setFormError('Please enter a reason of at least 3 characters');
      return;
    }
    setPending(true);
    const r = await issueCreditNoteAction({
      invoiceId,
      invoiceNumber,
      profileHref,
      amount,
      reason,
    });
    setPending(false);
    if (!r.ok) {
      setFormError(r.error.message);
      return;
    }
    toast.success(`Credit note ${r.data.number} issued against ${invoiceNumber}`);
    reset();
    setOpen(false);
  };

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
            <ReceiptText className="mr-1.5 size-4" />
            Issue credit note
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Issue credit note against {invoiceNumber}</DialogTitle>
          <DialogDescription>
            Credit notes correct a paid or partially-paid invoice under Irish VAT rules — the
            original invoice row stays untouched. Enter the amount to credit and a short reason
            (both audited). A fresh <span className="font-mono">CRN-YYYY-NNNNNN</span> is allocated
            on save.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cn-amount">Amount to credit ({currencyCode})</Label>
            <Input
              id="cn-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={maxCreditAmount}
            />
            <p className="text-[11px] text-muted-foreground">
              Maximum: <span className="font-mono">{maxCreditAmount}</span> — the invoice total
              minus any credits already issued.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cn-reason">Reason (audited)</Label>
            <Textarea
              id="cn-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Over-charge on quantity, service partially delivered"
              maxLength={500}
            />
          </div>
          {formError && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
              <span>{formError}</span>
            </div>
          )}
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
          <Button onClick={submit} disabled={pending}>
            {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Issue credit note
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

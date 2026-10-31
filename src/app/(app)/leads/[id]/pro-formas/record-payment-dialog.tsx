'use client';

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
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
import { todayInDublin } from '@/lib/dates';
import { recordProFormaPaymentAction } from '@/modules/proformas/actions';

/**
 * Record a payment against an accepted pro forma. Amount defaults to the
 * outstanding balance so the common "fully paid" case is one click + confirm.
 * The server refuses verification later if the amount would overallocate;
 * recording is lenient so operators can log what the client actually sent.
 */
export function RecordPaymentDialog({
  proFormaInvoiceId,
  currencyCode,
  defaultAmount,
}: {
  proFormaInvoiceId: string;
  currencyCode: string;
  defaultAmount: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [amount, setAmount] = useState(defaultAmount);
  const [method, setMethod] = useState<'BANK_TRANSFER' | 'CASH' | 'OTHER'>('BANK_TRANSFER');
  const [receivedAt, setReceivedAt] = useState(() => todayInDublin());
  const [proofReference, setProofReference] = useState('');

  function submit() {
    const n = Number.parseFloat(amount);
    if (!Number.isFinite(n) || n <= 0) {
      toast.error('Amount must be a positive number');
      return;
    }
    startTransition(async () => {
      const r = await recordProFormaPaymentAction({
        proFormaInvoiceId,
        amount,
        currencyCode,
        method,
        receivedAt: receivedAt || undefined,
        proofReference: proofReference || undefined,
      });
      if (r.ok) {
        // Stage C workflow collapse — finance roles verify in the same
        // action; the toast tells the truth about which path ran.
        if (r.data.autoVerified) {
          toast.success(
            r.data.issuedInvoiceNumber
              ? `Payment verified — invoice ${r.data.issuedInvoiceNumber} issued and candidate activated`
              : 'Payment verified — receipt issued',
          );
        } else {
          toast.success('Payment recorded (pending verification)');
        }
        setOpen(false);
        router.refresh();
      } else {
        toast.error(r.error.message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" variant="outline">
            Record payment
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>
            Logs a payment against this pro forma. It stays PENDING until Finance verifies the bank
            line, at which point a receipt is issued.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="pfp-amount">Amount ({currencyCode})</Label>
              <Input
                id="pfp-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pfp-method">Method</Label>
              <Select
                id="pfp-method"
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
            <Label htmlFor="pfp-received">Received on</Label>
            <Input
              id="pfp-received"
              type="date"
              value={receivedAt}
              onChange={(e) => setReceivedAt(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pfp-ref">Reference (optional)</Label>
            <Input
              id="pfp-ref"
              value={proofReference}
              onChange={(e) => setProofReference(e.target.value)}
              placeholder="Bank statement ID or receipt no."
              maxLength={500}
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" type="button" disabled={pending} />}>
            Cancel
          </DialogClose>
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Record payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function VerifyPaymentButton({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const { verifyProFormaPaymentAction } = await import('@/modules/proformas/actions');
      const r = await verifyProFormaPaymentAction({ paymentId });
      if (r.ok) {
        // Stage 6F — the verify path now also activates the candidate
        // when the pro forma reaches full-paid. Report the full
        // outcome ("invoice issued, candidate active") instead of just
        // "invoice issued" so operators know they're done, not partway
        // through onboarding.
        if (r.data.candidateProfileId && r.data.issuedInvoiceNumber) {
          toast.success(
            `Payment verified. Official invoice ${r.data.issuedInvoiceNumber} issued and candidate is now active.`,
          );
        } else if (r.data.issuedInvoiceNumber) {
          toast.success(`Payment verified. Official invoice issued: ${r.data.issuedInvoiceNumber}`);
        } else {
          toast.success('Payment verified. Receipt issued.');
        }
        router.refresh();
      } else {
        toast.error(r.error.message);
      }
    });
  }

  return (
    <Button size="sm" variant="outline" onClick={submit} disabled={pending}>
      {pending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
      Verify
    </Button>
  );
}

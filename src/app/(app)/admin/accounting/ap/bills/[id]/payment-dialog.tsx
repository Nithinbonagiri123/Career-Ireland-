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
import { recordBillPaymentAction } from '@/modules/ap/actions';

export function BillPaymentDialog({
  billId,
  outstanding,
  currencyCode,
  trigger,
}: {
  billId: string;
  outstanding: string;
  currencyCode: string;
  trigger: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState(outstanding);
  const [method, setMethod] = useState<
    'BANK_TRANSFER' | 'CARD' | 'CASH' | 'DIRECT_DEBIT' | 'CHEQUE' | 'OTHER'
  >('BANK_TRANSFER');
  const [reference, setReference] = useState('');
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const onSubmit = () => {
    if (!/^\d+(\.\d{1,2})?$/.test(amount)) {
      toast.error('Enter a valid amount');
      return;
    }
    startTransition(async () => {
      const r = await recordBillPaymentAction({
        billId,
        paymentDate,
        amount,
        method,
        reference: reference.trim() || undefined,
      });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      toast.success(`Recorded ${amount} ${currencyCode} payment`);
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>
            Posts DR 2000 Accounts Payable / CR 1010 Bank. Bill status flips to PAID if this settles
            the balance, PARTIALLY_PAID otherwise. Outstanding today:{' '}
            <span className="font-medium text-foreground">
              {outstanding} {currencyCode}
            </span>
            .
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pay-date" className="text-xs font-medium">
                Payment date
              </Label>
              <Input
                id="pay-date"
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-amount" className="text-xs font-medium">
                Amount ({currencyCode})
              </Label>
              <Input
                id="pay-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pay-method" className="text-xs font-medium">
              Method
            </Label>
            <Select
              id="pay-method"
              value={method}
              onChange={(e) =>
                setMethod(
                  e.target.value as
                    | 'BANK_TRANSFER'
                    | 'CARD'
                    | 'CASH'
                    | 'DIRECT_DEBIT'
                    | 'CHEQUE'
                    | 'OTHER',
                )
              }
            >
              <option value="BANK_TRANSFER">Bank transfer</option>
              <option value="CARD">Card</option>
              <option value="CASH">Cash</option>
              <option value="DIRECT_DEBIT">Direct debit</option>
              <option value="CHEQUE">Cheque</option>
              <option value="OTHER">Other</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pay-ref" className="text-xs font-medium">
              Reference (optional)
            </Label>
            <Input
              id="pay-ref"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. SEPA batch #4421"
            />
          </div>
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" size="sm" disabled={pending} />} />
          <Button size="sm" onClick={onSubmit} disabled={pending}>
            {pending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
            Record payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

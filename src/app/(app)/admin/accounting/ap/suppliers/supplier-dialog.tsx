'use client';

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useState, useTransition } from 'react';
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
import { createSupplierAction, updateSupplierAction } from '@/modules/ap/actions';

/**
 * One dialog for create + edit. In edit mode (`initial` set) only the
 * fields that differ get sent to the server action.
 */
export function SupplierDialog({
  initial,
  trigger,
}: {
  initial?: {
    id: string;
    legalName: string;
    tradingName: string | null;
    email: string | null;
    phone: string | null;
    taxNumber: string | null;
    country: string | null;
    currencyCode: string | null;
    paymentTermsDays: number;
    isActive: boolean;
  };
  trigger: React.ReactElement;
}) {
  const isEdit = Boolean(initial);
  const [open, setOpen] = useState(false);
  const [legalName, setLegalName] = useState(initial?.legalName ?? '');
  const [tradingName, setTradingName] = useState(initial?.tradingName ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [taxNumber, setTaxNumber] = useState(initial?.taxNumber ?? '');
  const [country, setCountry] = useState(initial?.country ?? '');
  const [currency, setCurrency] = useState(initial?.currencyCode ?? 'EUR');
  const [terms, setTerms] = useState(String(initial?.paymentTermsDays ?? 30));
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  // Unique ids: one dialog per supplier row lives on the same page.
  const uid = useId();
  const fid = (name: string) => `${uid}-${name}`;

  const onSubmit = () => {
    if (!legalName.trim()) {
      toast.error('Legal name is required');
      return;
    }
    startTransition(async () => {
      const payload = {
        legalName: legalName.trim(),
        tradingName: tradingName.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        taxNumber: taxNumber.trim() || undefined,
        country: country.trim().toUpperCase() || undefined,
        currencyCode: currency.trim().toUpperCase() || undefined,
        paymentTermsDays: Number.parseInt(terms, 10) || 30,
      };
      const r =
        isEdit && initial
          ? await updateSupplierAction({ id: initial.id, ...payload })
          : await createSupplierAction(payload);
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      toast.success(isEdit ? 'Supplier updated' : 'Supplier added');
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit supplier' : 'Add supplier'}</DialogTitle>
          <DialogDescription>
            Supplier master record. Payment terms set the due date on new bills; the currency is the
            default for new bills and can be changed per bill.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Field label="Legal name" htmlFor={fid('legal-name')}>
            <Input
              id={fid('legal-name')}
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              placeholder="Acme Legal Services Ltd"
            />
          </Field>
          <Field label="Trading name (optional)" htmlFor={fid('trading-name')}>
            <Input
              id={fid('trading-name')}
              value={tradingName}
              onChange={(e) => setTradingName(e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Email" htmlFor={fid('email')}>
              <Input
                id={fid('email')}
                type="email"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field label="Phone" htmlFor={fid('phone')}>
              <Input
                id={fid('phone')}
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Tax number" htmlFor={fid('tax-number')}>
              <Input
                id={fid('tax-number')}
                value={taxNumber}
                onChange={(e) => setTaxNumber(e.target.value)}
              />
            </Field>
            <Field label="Country (2-letter)" htmlFor={fid('country')}>
              <Input
                id={fid('country')}
                value={country}
                onChange={(e) => setCountry(e.target.value.toUpperCase())}
                maxLength={2}
                placeholder="IE"
              />
            </Field>
            <Field label="Currency" htmlFor={fid('currency')}>
              <Input
                id={fid('currency')}
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                maxLength={3}
              />
            </Field>
          </div>
          <Field label="Payment terms (days)" htmlFor={fid('terms')}>
            <Input
              id={fid('terms')}
              inputMode="numeric"
              value={terms}
              onChange={(e) => setTerms(e.target.value.replace(/[^0-9]/g, ''))}
            />
          </Field>
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" size="sm" disabled={pending} />}>
            Cancel
          </DialogClose>
          <Button size="sm" onClick={onSubmit} disabled={pending}>
            {pending && <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden />}
            {isEdit ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-xs font-medium">
        {label}
      </Label>
      {children}
    </div>
  );
}

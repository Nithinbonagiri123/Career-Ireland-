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
import { todayInDublin } from '@/lib/dates';
import { createSupplierBillAction } from '@/modules/ap/actions';

/**
 * Create-bill dialog. Hits `createSupplierBillAction` which emits a
 * SUPPLIER_BILL_POSTED event. The event's payload carries the chosen
 * expense account code so the outbox-drain routes the DR side to the
 * right chart row (overrides the static rule).
 */
export function BillDialog({
  suppliers,
  expenseAccounts,
  trigger,
}: {
  suppliers: Array<{
    id: string;
    legalName: string;
    currencyCode: string | null;
    paymentTermsDays: number;
  }>;
  expenseAccounts: Array<{ code: string; name: string }>;
  trigger: React.ReactElement;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? '');
  const [supplierRef, setSupplierRef] = useState('');
  const [billDate, setBillDate] = useState(() => todayInDublin());
  const [currency, setCurrency] = useState<string>('EUR');
  const [subtotal, setSubtotal] = useState('');
  const [taxAmount, setTaxAmount] = useState('0');
  const [expenseAccount, setExpenseAccount] = useState(expenseAccounts[0]?.code ?? '');
  const [description, setDescription] = useState('');
  const [pending, startTransition] = useTransition();
  const uid = useId();
  const fid = (name: string) => `${uid}-${name}`;

  const selectedSupplier = suppliers.find((s) => s.id === supplierId);
  // Compute due date = bill date + supplier's payment terms days.
  const dueDate = useMemo(() => {
    if (!billDate) return '';
    const terms = selectedSupplier?.paymentTermsDays ?? 30;
    const d = new Date(billDate);
    d.setUTCDate(d.getUTCDate() + terms);
    return d.toISOString().slice(0, 10);
  }, [billDate, selectedSupplier]);

  const subtotalFloat = Number.parseFloat(subtotal || '0');
  const taxFloat = Number.parseFloat(taxAmount || '0');
  const total =
    Number.isFinite(subtotalFloat) && Number.isFinite(taxFloat)
      ? (subtotalFloat + taxFloat).toFixed(2)
      : '0.00';

  const canSubmit =
    supplierId &&
    expenseAccount &&
    description.trim() &&
    /^\d+(\.\d{1,2})?$/.test(subtotal) &&
    /^\d+(\.\d{1,2})?$/.test(taxAmount) &&
    /^[A-Z]{3}$/.test(currency);

  const onSubmit = () => {
    if (!canSubmit) return;
    startTransition(async () => {
      const r = await createSupplierBillAction({
        supplierId,
        supplierReference: supplierRef.trim() || undefined,
        billDate,
        dueDate,
        currencyCode: currency,
        subtotal,
        taxAmount,
        expenseAccountCode: expenseAccount,
        description: description.trim(),
      });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      toast.success(`Bill ${r.data.number} posted`);
      setOpen(false);
      router.push(`/admin/accounting/ap/bills/${r.data.id}`);
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New supplier bill</DialogTitle>
          <DialogDescription>
            Posts to the ledger: debit the expense account
            {expenseAccount ? ` ${expenseAccount}` : ''} and 1050 VAT Recoverable (when VAT is above
            0), credit 2000 Accounts Payable. Record the payment separately.
          </DialogDescription>
        </DialogHeader>

        {suppliers.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Add a supplier first — bills can't exist without one.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor={fid('supplier')} className="text-xs font-medium">
                Supplier
              </Label>
              <Select
                id={fid('supplier')}
                value={supplierId}
                onChange={(e) => {
                  setSupplierId(e.target.value);
                  const s = suppliers.find((x) => x.id === e.target.value);
                  if (s?.currencyCode) setCurrency(s.currencyCode);
                }}
              >
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.legalName}
                    {s.currencyCode ? ` · ${s.currencyCode}` : ''}
                  </option>
                ))}
              </Select>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={fid('bill-date')} className="text-xs font-medium">
                  Bill date
                </Label>
                <Input
                  id={fid('bill-date')}
                  type="date"
                  value={billDate}
                  onChange={(e) => setBillDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={fid('supplier-ref')} className="text-xs font-medium">
                  Supplier invoice ref (optional)
                </Label>
                <Input
                  id={fid('supplier-ref')}
                  value={supplierRef}
                  onChange={(e) => setSupplierRef(e.target.value)}
                  placeholder="e.g. 2026-003"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor={fid('currency')} className="text-xs font-medium">
                  Currency
                </Label>
                <Select
                  id={fid('currency')}
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                >
                  <option value="EUR">EUR</option>
                  <option value="ZAR">ZAR</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={fid('subtotal')} className="text-xs font-medium">
                  Subtotal
                </Label>
                <Input
                  id={fid('subtotal')}
                  inputMode="decimal"
                  value={subtotal}
                  onChange={(e) => setSubtotal(e.target.value)}
                  placeholder="100.00"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={fid('tax')} className="text-xs font-medium">
                  VAT
                </Label>
                <Input
                  id={fid('tax')}
                  inputMode="decimal"
                  value={taxAmount}
                  onChange={(e) => setTaxAmount(e.target.value)}
                  placeholder="23.00"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={fid('total')} className="text-xs font-medium">
                  Total
                </Label>
                <output
                  id={fid('total')}
                  aria-live="polite"
                  className="block rounded-md border border-border bg-muted/40 px-2 py-1.5 text-sm tabular-nums"
                >
                  {total}
                </output>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={fid('expense')} className="text-xs font-medium">
                Expense account
              </Label>
              <Select
                id={fid('expense')}
                value={expenseAccount}
                onChange={(e) => setExpenseAccount(e.target.value)}
              >
                {expenseAccounts.map((a) => (
                  <option key={a.code} value={a.code}>
                    {a.code} · {a.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={fid('description')} className="text-xs font-medium">
                Description
              </Label>
              <Input
                id={fid('description')}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. December office rent"
              />
            </div>

            <p className="text-[11px] text-muted-foreground">
              Due date auto-set from supplier terms: <span className="font-medium">{dueDate}</span>.
            </p>
          </div>
        )}

        <DialogFooter>
          <DialogClose render={<Button variant="outline" size="sm" disabled={pending} />}>
            Cancel
          </DialogClose>
          <Button
            size="sm"
            onClick={onSubmit}
            disabled={pending || !canSubmit || suppliers.length === 0}
          >
            {pending && <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden />}
            Post bill
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

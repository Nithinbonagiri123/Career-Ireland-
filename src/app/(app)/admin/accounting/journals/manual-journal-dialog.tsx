'use client';

import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useTransition } from 'react';
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
import { postManualJournalAction } from '@/modules/accounting/actions';

/**
 * Admin-only form for posting a balanced journal by hand. Live-checks
 * `sum(debit) == sum(credit)` so the user sees whether the save will be
 * accepted before they submit; the server does the check again and the
 * DB-level trigger does it a third time at commit.
 *
 * No draft support in Phase 1 — the form posts straight to POSTED on
 * submit. Admins who need draft/approval use the reversal flow instead.
 */

type Account = { id: string; code: string; name: string; allowPosting: boolean };
type Division = { id: string; code: string; name: string };

type LineRow = {
  accountCode: string;
  divisionCode: string;
  debit: string;
  credit: string;
  description: string;
};

const EMPTY_LINE: LineRow = {
  accountCode: '',
  divisionCode: '',
  debit: '0',
  credit: '0',
  description: '',
};

export function ManualJournalDialog({
  accounts,
  divisions,
  defaultOpen,
  trigger,
}: {
  accounts: Account[];
  divisions: Division[];
  defaultOpen?: boolean;
  trigger: React.ReactElement;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [journalDate, setJournalDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [lines, setLines] = useState<LineRow[]>([EMPTY_LINE, EMPTY_LINE]);
  const [pending, startTransition] = useTransition();

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally one-shot
  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, []);

  const postableAccounts = useMemo(() => accounts.filter((a) => a.allowPosting), [accounts]);

  const totals = useMemo(() => {
    let d = 0;
    let c = 0;
    for (const l of lines) {
      const dd = Number.parseFloat(l.debit || '0');
      const cc = Number.parseFloat(l.credit || '0');
      if (Number.isFinite(dd)) d += Math.round(dd * 100);
      if (Number.isFinite(cc)) c += Math.round(cc * 100);
    }
    return {
      debit: (d / 100).toFixed(2),
      credit: (c / 100).toFixed(2),
      balanced: d === c && d > 0,
    };
  }, [lines]);

  const canSubmit = useMemo(() => {
    if (!description.trim()) return false;
    if (!/^[A-Z]{3}$/.test(currency)) return false;
    if (lines.length < 2) return false;
    for (const l of lines) {
      if (!l.accountCode) return false;
      const dd = Number.parseFloat(l.debit || '0');
      const cc = Number.parseFloat(l.credit || '0');
      if (!Number.isFinite(dd) || !Number.isFinite(cc)) return false;
      if (dd < 0 || cc < 0) return false;
      // XOR: exactly one must be non-zero
      if (dd > 0 === cc > 0) return false;
    }
    return totals.balanced;
  }, [description, currency, lines, totals.balanced]);

  const updateLine = (i: number, patch: Partial<LineRow>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const addLine = () => setLines((prev) => [...prev, EMPTY_LINE]);
  const removeLine = (i: number) =>
    setLines((prev) => (prev.length > 2 ? prev.filter((_, idx) => idx !== i) : prev));

  const onSubmit = () => {
    if (!canSubmit) return;
    startTransition(async () => {
      const r = await postManualJournalAction({
        journalDate,
        description: description.trim(),
        transactionCurrency: currency,
        lines: lines.map((l) => ({
          accountCode: l.accountCode,
          divisionCode: l.divisionCode || undefined,
          debit: l.debit || '0',
          credit: l.credit || '0',
          description: l.description.trim() || undefined,
        })),
      });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      toast.success(`Journal ${r.data.number} posted`);
      setOpen(false);
      setDescription('');
      setLines([EMPTY_LINE, EMPTY_LINE]);
      router.push(`/admin/accounting/journals/${r.data.id}`);
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Post manual journal</DialogTitle>
          <DialogDescription>
            Debits must equal credits. The DB-level balance trigger enforces this at commit — if the
            numbers don't tie, nothing is written.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="jrn-date" className="text-xs font-medium">
                Journal date
              </Label>
              <Input
                id="jrn-date"
                type="date"
                value={journalDate}
                onChange={(e) => setJournalDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-1">
              <Label htmlFor="jrn-ccy" className="text-xs font-medium">
                Currency
              </Label>
              <Select id="jrn-ccy" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option value="EUR">EUR</option>
                <option value="ZAR">ZAR</option>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-1">
              <Label className="text-xs font-medium">Lines</Label>
              <div className="text-sm tabular-nums">
                <span className={totals.balanced ? 'text-emerald-600' : 'text-destructive'}>
                  DR {totals.debit} / CR {totals.credit}
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="jrn-desc" className="text-xs font-medium">
              Description
            </Label>
            <Input
              id="jrn-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Opening balance — bank"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">Journal lines</Label>
              <Button variant="outline" size="sm" onClick={addLine}>
                <Plus className="mr-1.5 size-3.5" /> Add line
              </Button>
            </div>
            <div className="space-y-2">
              {lines.map((l, i) => (
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: lines are rendered in input order; adding/removing shifts indices intentionally
                  key={i}
                  className="grid grid-cols-12 gap-2 rounded-md border border-border bg-background p-2"
                >
                  <div className="col-span-4">
                    <Select
                      value={l.accountCode}
                      onChange={(e) => updateLine(i, { accountCode: e.target.value })}
                      aria-label={`Line ${i + 1} account`}
                    >
                      <option value="">— account —</option>
                      {postableAccounts.map((a) => (
                        <option key={a.code} value={a.code}>
                          {a.code} · {a.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Select
                      value={l.divisionCode}
                      onChange={(e) => updateLine(i, { divisionCode: e.target.value })}
                      aria-label={`Line ${i + 1} division`}
                    >
                      <option value="">any div.</option>
                      {divisions.map((d) => (
                        <option key={d.code} value={d.code}>
                          {d.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Input
                      inputMode="decimal"
                      value={l.debit}
                      onChange={(e) => updateLine(i, { debit: e.target.value, credit: '0' })}
                      placeholder="Debit"
                      aria-label={`Line ${i + 1} debit`}
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      inputMode="decimal"
                      value={l.credit}
                      onChange={(e) => updateLine(i, { credit: e.target.value, debit: '0' })}
                      placeholder="Credit"
                      aria-label={`Line ${i + 1} credit`}
                    />
                  </div>
                  <div className="col-span-2 flex items-center justify-end">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeLine(i)}
                      disabled={lines.length <= 2}
                      aria-label={`Delete line ${i + 1}`}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" size="sm" disabled={pending} />} />
          <Button size="sm" onClick={onSubmit} disabled={pending || !canSubmit}>
            {pending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
            Post journal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

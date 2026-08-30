'use client';

import { format, formatDistanceToNow } from 'date-fns';
import { Coins, Plus, Send, Trash2, XCircle } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Currency } from '@/lib/db/schema/currencies';
import type { Offer } from '@/lib/db/schema/interviews_offers';
import {
  createOfferAction,
  removeOfferAction,
  updateOfferStatusAction,
} from '@/modules/offers/actions';

const STATUS_VARIANT: Record<Offer['status'], 'default' | 'secondary' | 'outline'> = {
  DRAFT: 'outline',
  SENT: 'secondary',
  NEGOTIATING: 'secondary',
  ACCEPTED: 'default',
  REJECTED: 'outline',
  WITHDRAWN: 'outline',
  EXPIRED: 'outline',
};

const PERIOD_LABEL: Record<Offer['period'], string> = {
  ANNUAL: '/yr',
  MONTHLY: '/mo',
  WEEKLY: '/wk',
  HOURLY: '/hr',
};

function CreateOfferDialog({
  applicationId,
  currencies,
}: {
  applicationId: string;
  currencies: Currency[];
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [currencyCode, setCurrencyCode] = useState(currencies[0]?.code ?? 'EUR');
  const [period, setPeriod] = useState<Offer['period']>('ANNUAL');
  const [startDate, setStartDate] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [terms, setTerms] = useState('');
  const [notes, setNotes] = useState('');
  const [pending, startTransition] = useTransition();

  const submit = () => {
    startTransition(async () => {
      const r = await createOfferAction({
        jobApplicationId: applicationId,
        amount,
        currencyCode,
        period,
        startDate,
        expiresOn,
        terms,
        notes,
      });
      if (r.ok) {
        toast.success('Draft offer created');
        setOpen(false);
        setAmount('');
        setTerms('');
        setNotes('');
      } else {
        toast.error(r.error.message);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm">
            <Plus className="mr-1 size-3.5" /> Draft offer
          </Button>
        }
      />
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Draft offer</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1">
              <Label htmlFor="amount">Amount *</Label>
              <Input
                id="amount"
                type="number"
                min={1}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ccy">Currency</Label>
              <select
                id="ccy"
                value={currencyCode}
                onChange={(e) => setCurrencyCode(e.target.value)}
                className="flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm"
              >
                {currencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="period">Period</Label>
            <select
              id="period"
              value={period}
              onChange={(e) => setPeriod(e.target.value as Offer['period'])}
              className="flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm"
            >
              <option value="ANNUAL">Annual</option>
              <option value="MONTHLY">Monthly</option>
              <option value="WEEKLY">Weekly</option>
              <option value="HOURLY">Hourly</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="startDate">Start date</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="expiresOn">Respond by</Label>
              <Input
                id="expiresOn"
                type="date"
                value={expiresOn}
                onChange={(e) => setExpiresOn(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="terms">Terms</Label>
            <Input
              id="terms"
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              placeholder="Benefits, bonuses, relocation, etc."
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="onotes">Notes</Label>
            <Input id="onotes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || !amount}>
            Create draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OfferRow({ offer, applicationId }: { offer: Offer; applicationId: string }) {
  const [, startTransition] = useTransition();

  const setStatus = (status: Offer['status']) => {
    startTransition(async () => {
      const r = await updateOfferStatusAction({ id: offer.id, status, notes: '' }, applicationId);
      if (r.ok) toast.success(`Offer ${status.toLowerCase()}`);
      else toast.error(r.error.message);
    });
  };

  const remove = () => {
    if (!confirm('Delete this draft offer?')) return;
    startTransition(async () => {
      const r = await removeOfferAction({ id: offer.id }, applicationId);
      if (r.ok) toast.success('Offer deleted');
      else toast.error(r.error.message);
    });
  };

  const canEdit = offer.status === 'DRAFT' || offer.status === 'NEGOTIATING';
  const isTerminal =
    offer.status === 'ACCEPTED' ||
    offer.status === 'REJECTED' ||
    offer.status === 'WITHDRAWN' ||
    offer.status === 'EXPIRED';

  return (
    <li className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">
            {Number(offer.amount).toLocaleString(undefined, {
              minimumFractionDigits: 0,
              maximumFractionDigits: 2,
            })}{' '}
            {offer.currencyCode}
            <span className="text-xs text-muted-foreground">{PERIOD_LABEL[offer.period]}</span>
          </span>
          <Badge variant={STATUS_VARIANT[offer.status]} className="rounded-full text-[10px]">
            {offer.status}
          </Badge>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Draft {formatDistanceToNow(offer.createdAt, { addSuffix: true })}
          {offer.sentAt && ` · sent ${formatDistanceToNow(offer.sentAt, { addSuffix: true })}`}
          {offer.respondedAt &&
            ` · responded ${formatDistanceToNow(offer.respondedAt, { addSuffix: true })}`}
          {offer.startDate && ` · starts ${format(new Date(offer.startDate), 'PP')}`}
          {offer.expiresOn && ` · respond by ${format(new Date(offer.expiresOn), 'PP')}`}
        </p>
        {offer.terms && (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">Terms: {offer.terms}</p>
        )}
        {offer.notes && (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{offer.notes}</p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {offer.status === 'DRAFT' && (
          <Button size="sm" onClick={() => setStatus('SENT')}>
            <Send className="mr-1 size-3.5" /> Send
          </Button>
        )}
        {offer.status === 'SENT' && (
          <>
            <Button size="sm" onClick={() => setStatus('ACCEPTED')}>
              Accepted
            </Button>
            <Button size="sm" variant="outline" onClick={() => setStatus('NEGOTIATING')}>
              Negotiating
            </Button>
            <Button size="sm" variant="outline" onClick={() => setStatus('REJECTED')}>
              Rejected
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setStatus('WITHDRAWN')}>
              Withdraw
            </Button>
          </>
        )}
        {offer.status === 'NEGOTIATING' && (
          <>
            <Button size="sm" onClick={() => setStatus('SENT')}>
              Re-send
            </Button>
            <Button size="sm" variant="outline" onClick={() => setStatus('REJECTED')}>
              Rejected
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setStatus('WITHDRAWN')}>
              Withdraw
            </Button>
          </>
        )}
        {isTerminal && (
          <span className="text-[11px] text-muted-foreground">
            <XCircle className="mr-1 inline size-3" />
            Locked — create a new offer to renegotiate
          </span>
        )}
        {canEdit && offer.status === 'DRAFT' && (
          <Button size="sm" variant="ghost" onClick={remove} aria-label="Delete draft">
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>
    </li>
  );
}

export function OffersSection({
  applicationId,
  rows,
  currencies,
}: {
  applicationId: string;
  rows: Offer[];
  currencies: Currency[];
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Coins className="size-4" /> Offers
            <Badge variant="secondary" className="ml-1 rounded-full">
              {rows.length}
            </Badge>
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Draft → Sent → Accepted / Negotiating. Accepting an offer auto-moves the application to
            ACCEPTED (which creates a Placement in PROPOSED).
          </p>
        </div>
        <CreateOfferDialog applicationId={applicationId} currencies={currencies} />
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState
            icon={Coins}
            title="No offers yet"
            description="Draft the first offer once the interview loop is done and the employer approves."
          />
        ) : (
          <ul className="divide-y">
            {rows.map((o) => (
              <OfferRow key={o.id} offer={o} applicationId={applicationId} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

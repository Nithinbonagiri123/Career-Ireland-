'use client';

import { Gift } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { grantComplimentaryServiceAction } from '@/modules/billing/actions';
import type { InvoiceableService } from '@/modules/billing/read';

/**
 * Stage B Wave 4 — "Grant complimentary service" dialog on the Services &
 * Billing tab. A deliberate, reason-required action: picks the service +
 * currency, issues a genuine €0.00 invoice (next sequential number,
 * settlement kind COMPLIMENTARY) and activates the engagement — no
 * payment step, by design. Only rendered for users who hold the
 * complimentary grant (ADMIN / owner / explicit permission); the server
 * re-checks regardless.
 */
export function ComplimentaryGrantDialog({
  personId,
  services,
  currencies,
}: {
  personId: string;
  services: InvoiceableService[];
  currencies: Array<{ code: string; name: string; symbol: string }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [serviceId, setServiceId] = useState('');
  const [currencyCode, setCurrencyCode] = useState('EUR');
  const [reason, setReason] = useState('');
  // One key per dialog mount — a double-click or network retry replays the
  // original grant instead of issuing a second invoice.
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);

  const canSubmit = serviceId && currencyCode.length === 3 && reason.trim().length >= 10;

  const submit = () => {
    if (!canSubmit) return;
    startTransition(async () => {
      const r = await grantComplimentaryServiceAction({
        personId,
        serviceCatalogItemId: serviceId,
        currencyCode,
        reason: reason.trim(),
        idempotencyKey,
      });
      if (r.ok) {
        toast.success(
          `Complimentary service granted — invoice ${r.data.invoiceNumber} (€0.00) issued`,
        );
        setOpen(false);
        router.refresh();
      } else {
        toast.error(r.error.message);
      }
    });
  };

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <Gift className="mr-1.5 size-4" aria-hidden />
        Grant complimentary service
      </Button>
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Grant complimentary service</DialogTitle>
            <DialogDescription>
              Issues a genuine €0.00 invoice with the next official number. No payment is recorded
              and no receipt is issued — nothing is owed. The reason below is audited and shown on
              the invoice record.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="comp-service">Service</Label>
              <Select
                id="comp-service"
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
              >
                <option value="">— select a service —</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="comp-currency">Currency</Label>
              <Select
                id="comp-currency"
                value={currencyCode}
                onChange={(e) => setCurrencyCode(e.target.value)}
              >
                {currencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="comp-reason">Reason (required, audited)</Label>
              <Textarea
                id="comp-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Hardship waiver approved by management on 20 Oct — see email thread"
                rows={3}
                maxLength={500}
              />
              {reason.trim().length > 0 && reason.trim().length < 10 && (
                <p className="text-xs text-status-warning">
                  Give a real reason — at least 10 characters.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={pending || !canSubmit}>
              {pending ? 'Granting…' : 'Grant & issue €0.00 invoice'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

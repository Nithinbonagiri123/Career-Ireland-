'use client';

import { AlertTriangle, Loader2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { FormErrorAlert } from '@/components/form-error-alert';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { ActionResult } from '@/lib/result';
import type { PlacementOfferException, PlacementTerms } from '@/modules/placements/schemas';

/** The server's refusal code when a seat is taken without an accepted offer. */
export const PLACEMENT_OFFER_REQUIRED = 'PLACEMENT_OFFER_REQUIRED';

/**
 * R3 — placing a candidate who has no offer accepted in the CRM (e.g. a
 * hire agreed through external recruitment). Opened only after the server
 * refuses the standard placement with PLACEMENT_OFFER_REQUIRED, so the
 * server stays the single judge of whether an accepted offer exists. The
 * confirmation and reason are re-checked and audited server-side; seat,
 * duplicate and employer checks still apply.
 */
export function PlacementExceptionDialog({
  open,
  onOpenChange,
  personName,
  successMessage,
  onSubmit,
  onPlaced,
  collectTerms = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  personName: string;
  successMessage: string;
  onSubmit: (
    exception: PlacementOfferException,
    terms?: PlacementTerms,
  ) => Promise<ActionResult<unknown>>;
  onPlaced?: () => void;
  /** P0 — also ask for the (optional) salary and start date, which have no
   *  accepted offer to be copied from on this path. */
  collectTerms?: boolean;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [reason, setReason] = useState('');
  const [salary, setSalary] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [startDate, setStartDate] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  const reset = () => {
    setConfirmed(false);
    setReason('');
    setSalary('');
    setCurrency('EUR');
    setStartDate('');
    setFormError(null);
    setFields({});
  };

  const submit = () =>
    start(async () => {
      setFormError(null);
      setFields({});
      let r: ActionResult<unknown>;
      try {
        r = await onSubmit(
          { confirmed: true, reason },
          collectTerms
            ? {
                salary: salary.trim().replace(/[,\s]/g, ''),
                salaryCurrencyCode: currency.trim().toUpperCase(),
                startDate,
              }
            : undefined,
        );
      } catch {
        setFormError('The request did not complete. Check your connection and try again.');
        return;
      }
      if (!r.ok) {
        const fieldErrors = r.error.fields ?? {};
        setFields(fieldErrors);
        // Field problems are shown next to the field; the top alert is for
        // everything else (e.g. the job filled up meanwhile).
        if (!Object.values(fieldErrors).includes(r.error.message)) setFormError(r.error.message);
        return;
      }
      toast.success(successMessage);
      reset();
      onOpenChange(false);
      onPlaced?.();
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-6">
            <AlertTriangle className="size-4 text-status-warning" aria-hidden />
            Place {personName} without an accepted offer?
          </DialogTitle>
          <DialogDescription>
            No offer has been recorded as accepted for this candidate in the CRM. Use this only when
            the hire was agreed outside the CRM, for example through external recruitment. Seat
            limits, duplicate and employer checks still apply, and no invoice is raised
            automatically.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          noValidate
          data-testid="placement-exception-form"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <FormField
            id="pe-reason"
            label="Reason (recorded in the audit log)"
            required
            error={fields.reason}
          >
            <Textarea
              id="pe-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Offer agreed directly between the employer and the candidate"
              autoComplete="off"
            />
          </FormField>
          {collectTerms && (
            <div className="space-y-3 rounded-lg border border-border/60 bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">
                Optional — there is no accepted offer to copy the pay and start date from.
              </p>
              <div className="flex gap-3">
                <FormField
                  id="pe-salary"
                  label="Salary"
                  error={fields.salary}
                  className="min-w-0 flex-1"
                >
                  <Input
                    id="pe-salary"
                    inputMode="decimal"
                    autoComplete="off"
                    value={salary}
                    onChange={(e) => setSalary(e.target.value)}
                    placeholder="e.g. 34000"
                  />
                </FormField>
                <FormField
                  id="pe-currency"
                  label="Currency"
                  error={fields.salaryCurrencyCode}
                  className="w-24 shrink-0"
                >
                  <Input
                    id="pe-currency"
                    autoComplete="off"
                    maxLength={3}
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                  />
                </FormField>
              </div>
              <FormField id="pe-start" label="Start date" error={fields.startDate}>
                <Input
                  id="pe-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </FormField>
            </div>
          )}
          <div className="flex items-start gap-2">
            <Checkbox
              id="pe-confirm"
              checked={confirmed}
              onCheckedChange={(v) => setConfirmed(v === true)}
              className="mt-0.5"
            />
            <Label htmlFor="pe-confirm" className="text-sm leading-snug font-normal">
              I confirm {personName} was hired without an offer accepted in the CRM.
            </Label>
          </div>
          {fields.confirmed && (
            <p className="text-xs text-destructive" role="alert">
              {fields.confirmed}
            </p>
          )}
          <FormErrorAlert error={formError} />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !confirmed}>
              {pending && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}
              Place without offer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

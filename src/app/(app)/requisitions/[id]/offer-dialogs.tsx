'use client';

import { format } from 'date-fns';
import { type ReactElement, useState } from 'react';
import { ActionDialog, fieldError } from '@/components/action-dialog';
import { FormField } from '@/components/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { formatCurrency } from '@/lib/currency';
import {
  createOfferAction,
  transitionOfferAction,
  updateOfferAction,
} from '@/modules/offers/actions';
import { markApplicationPlacedAction } from '@/modules/placements/actions';
import type {
  RequisitionApplicationOption,
  RequisitionOfferRow,
} from '@/modules/requisitions/workspace';

const PERIOD_LABEL: Record<string, string> = {
  ANNUAL: 'per year',
  MONTHLY: 'per month',
  WEEKLY: 'per week',
  HOURLY: 'per hour',
};

export function OfferFormDialog({
  trigger,
  applications,
  currencies,
  existing,
  defaultApplicationId,
}: {
  trigger: ReactElement;
  applications: RequisitionApplicationOption[];
  currencies: string[];
  existing?: RequisitionOfferRow;
  defaultApplicationId?: string;
}) {
  const eligible = applications.filter((a) => a.status === 'INTERVIEW' || a.status === 'OFFER');
  const [applicationId, setApplicationId] = useState(
    existing?.applicationId ?? defaultApplicationId ?? eligible[0]?.applicationId ?? '',
  );
  const [amount, setAmount] = useState(existing?.amount ?? '');
  const [currencyCode, setCurrency] = useState(existing?.currencyCode ?? currencies[0] ?? 'EUR');
  const [period, setPeriod] = useState(existing?.period ?? 'ANNUAL');
  const [startDate, setStartDate] = useState(existing?.startDate ?? '');
  const [expiresOn, setExpiresOn] = useState(existing?.expiresOn ?? '');
  const [terms, setTerms] = useState(existing?.terms ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');

  return (
    <ActionDialog
      trigger={trigger}
      wide
      title={existing ? 'Edit offer' : 'Create offer'}
      description={
        existing
          ? existing.personName
          : 'Saved as a draft. Recording it as sent later does not email anyone — send it the usual way.'
      }
      submitLabel={existing ? 'Save changes' : 'Create draft offer'}
      successMessage={existing ? 'Offer updated' : 'Draft offer created'}
      onSubmit={() => {
        const t = {
          amount,
          currencyCode,
          period: period as 'ANNUAL',
          startDate,
          expiresOn,
          terms,
          notes,
        };
        return existing
          ? updateOfferAction({ offerId: existing.id, ...t })
          : createOfferAction({ applicationId, ...t });
      }}
    >
      {(errors) => (
        <>
          {!existing && (
            <FormField
              id="of-candidate"
              label="Candidate"
              required
              error={fieldError(errors, 'applicationId')}
            >
              {eligible.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Offers can be made once a candidate reaches the Interview stage.
                </p>
              ) : (
                <Select
                  id="of-candidate"
                  value={applicationId}
                  onChange={(e) => setApplicationId(e.target.value)}
                >
                  {eligible.map((a) => (
                    <option key={a.applicationId} value={a.applicationId}>
                      {a.personName} — {a.status.toLowerCase()}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <FormField
              id="of-amount"
              label="Pay"
              required
              error={fieldError(errors, 'amount')}
              className="sm:col-span-1"
            >
              <Input
                id="of-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="32000"
              />
            </FormField>
            <FormField id="of-currency" label="Currency" error={fieldError(errors, 'currencyCode')}>
              <Select
                id="of-currency"
                value={currencyCode}
                onChange={(e) => setCurrency(e.target.value)}
              >
                {currencies.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField id="of-period" label="Period">
              <Select id="of-period" value={period} onChange={(e) => setPeriod(e.target.value)}>
                {Object.entries(PERIOD_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField
              id="of-start"
              label="Proposed start date"
              error={fieldError(errors, 'startDate')}
            >
              <Input
                id="of-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </FormField>
            <FormField id="of-expires" label="Respond by" error={fieldError(errors, 'expiresOn')}>
              <Input
                id="of-expires"
                type="date"
                value={expiresOn}
                onChange={(e) => setExpiresOn(e.target.value)}
              />
            </FormField>
          </div>
          <FormField id="of-terms" label="Terms" error={fieldError(errors, 'terms')}>
            <Textarea
              id="of-terms"
              rows={3}
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
            />
          </FormField>
          <FormField id="of-notes" label="Internal notes" error={fieldError(errors, 'notes')}>
            <Textarea
              id="of-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </FormField>
        </>
      )}
    </ActionDialog>
  );
}

const TRANSITION_COPY: Record<
  string,
  {
    title: string;
    submit: string;
    success: string;
    body: string;
    needsReason?: boolean;
    destructive?: boolean;
  }
> = {
  SENT: {
    title: 'Record offer as sent',
    submit: 'Record as sent',
    success: 'Offer recorded as sent',
    body: 'Records that you sent this offer to the candidate yourself. The CRM does not email it.',
  },
  NEGOTIATING: {
    title: 'Candidate is negotiating',
    submit: 'Mark as negotiating',
    success: 'Offer marked as negotiating',
    body: 'You can edit the terms, then record the revised offer as sent.',
  },
  ACCEPTED: {
    title: 'Record acceptance',
    submit: 'Record acceptance',
    success: 'Acceptance recorded',
    body: 'Records the candidate’s acceptance. Placing them on the job is a separate step with seat checks.',
  },
  REJECTED: {
    title: 'Record decline',
    submit: 'Record decline',
    success: 'Decline recorded',
    body: 'Records that the candidate declined. The application stays as it is — reject or withdraw it on the Pipeline if needed.',
    needsReason: true,
    destructive: true,
  },
  WITHDRAWN: {
    title: 'Withdraw offer',
    submit: 'Withdraw offer',
    success: 'Offer withdrawn',
    body: 'The offer is closed and kept in the history.',
    needsReason: true,
    destructive: true,
  },
  EXPIRED: {
    title: 'Mark offer expired',
    submit: 'Mark expired',
    success: 'Offer marked expired',
    body: 'Use when the candidate did not respond in time.',
    destructive: true,
  },
};

export function OfferTransitionDialog({
  trigger,
  offer,
  to,
}: {
  trigger: ReactElement;
  offer: RequisitionOfferRow;
  to: keyof typeof TRANSITION_COPY;
}) {
  const copy = TRANSITION_COPY[to];
  const [note, setNote] = useState('');
  if (!copy) return null;
  return (
    <ActionDialog
      trigger={trigger}
      title={copy.title}
      description={copy.body}
      submitLabel={copy.submit}
      destructive={copy.destructive}
      successMessage={copy.success}
      onSubmit={() =>
        transitionOfferAction({
          offerId: offer.id,
          to: to as 'SENT',
          note,
        })
      }
    >
      {(errors) => (
        <FormField
          id="of-note"
          label={copy.needsReason ? 'Reason' : 'Note (optional)'}
          required={copy.needsReason}
          error={fieldError(errors, 'note')}
        >
          <Textarea
            id="of-note"
            rows={3}
            autoComplete="off"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </FormField>
      )}
    </ActionDialog>
  );
}

/** Hand-off to R0's guarded placement action — capacity, duplicate and
 *  employer checks all run there; nothing is bypassed. P0 — the accepted
 *  offer's pay and start date are copied onto the placement (server side);
 *  the dialog says so. */
export function PlaceCandidateDialog({
  trigger,
  application,
  offer,
}: {
  trigger: ReactElement;
  application: RequisitionApplicationOption;
  /** The accepted offer whose terms the placement will carry. */
  offer?: RequisitionOfferRow;
}) {
  const terms = offer
    ? [
        `${formatCurrency(offer.amount, offer.currencyCode, { maximumFractionDigits: 0 })} ${offer.period.toLowerCase()}`,
        offer.startDate
          ? `starting ${format(new Date(`${offer.startDate}T00:00:00`), 'd MMM yyyy')}`
          : 'no start date yet',
      ].join(', ')
    : null;
  return (
    <ActionDialog
      trigger={trigger}
      title={`Place ${application.personName}?`}
      description={`Creates a confirmed placement on this job${terms ? ` with the accepted offer's terms (${terms})` : ''}. Seat limits, duplicate and employer checks apply, and no invoice is raised automatically.`}
      submitLabel="Place candidate"
      successMessage={`${application.personName} placed`}
      onSubmit={() => markApplicationPlacedAction(application.applicationId)}
    >
      {() => null}
    </ActionDialog>
  );
}

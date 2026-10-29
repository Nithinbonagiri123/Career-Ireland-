'use client';

import { type ReactElement, useState } from 'react';
import { ActionDialog, fieldError } from '@/components/action-dialog';
import { FormField } from '@/components/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { Advertisement } from '@/lib/db/schema/campaigns';
import { upsertAdvertisementAction } from '@/modules/campaigns/actions';
import { AD_NEXT, AD_STATUS_LABEL, type AdStatus } from '@/modules/campaigns/labels';

/**
 * R4 — create / edit an advertisement. Only the statuses the server allows
 * from the current one are offered; "Running" needs an active campaign.
 */
export function AdDialog({
  trigger,
  campaignId,
  campaignActive,
  initial,
}: {
  trigger: ReactElement;
  campaignId: string;
  campaignActive: boolean;
  initial?: Advertisement;
}) {
  const [country, setCountry] = useState(initial?.country ?? '');
  const [platform, setPlatform] = useState(initial?.platform ?? '');
  const [target, setTarget] = useState(String(initial?.targetApplicants ?? 10));
  const [startDate, setStartDate] = useState(initial?.startDate ?? '');
  const [expiryDate, setExpiryDate] = useState(initial?.expiryDate ?? '');
  const [reminderOn, setReminderOn] = useState(initial?.reminderOn ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const current = (initial?.status ?? 'DRAFT') as AdStatus;
  const [status, setStatus] = useState<AdStatus>(current);
  // Running an ad needs an active campaign (paused campaigns keep ads suspended).
  const options: AdStatus[] = initial
    ? [current, ...AD_NEXT[current].filter((s) => s !== 'ACTIVE' || campaignActive)]
    : campaignActive
      ? ['DRAFT', 'ACTIVE']
      : ['DRAFT'];

  return (
    <ActionDialog
      trigger={trigger}
      wide
      title={initial ? 'Edit advertisement' : 'New advertisement'}
      description={
        !campaignActive && !initial
          ? 'The campaign is not active (draft or paused), so the advertisement starts as a draft.'
          : undefined
      }
      submitLabel={initial ? 'Save' : 'Add advertisement'}
      successMessage={initial ? 'Advertisement updated' : 'Advertisement added'}
      onSubmit={() =>
        upsertAdvertisementAction({
          id: initial?.id,
          campaignId,
          country,
          platform,
          targetApplicants: Number.parseInt(target, 10) || 0,
          startDate,
          expiryDate,
          reminderOn,
          status,
          notes,
        })
      }
    >
      {(errors) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="ad-country" label="Country" required error={fieldError(errors, 'country')}>
            <Input
              id="ad-country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="e.g. Ireland"
            />
          </FormField>
          <FormField id="ad-platform" label="Platform" error={fieldError(errors, 'platform')}>
            <Input
              id="ad-platform"
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              placeholder="e.g. IrishJobs, Facebook"
            />
          </FormField>
          <FormField
            id="ad-target"
            label="Target applicants"
            required
            error={fieldError(errors, 'targetApplicants')}
          >
            <Input
              id="ad-target"
              type="number"
              min={1}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          </FormField>
          <FormField id="ad-status" label="Status" error={fieldError(errors, 'status')}>
            <Select
              id="ad-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as AdStatus)}
            >
              {options.map((s) => (
                <option key={s} value={s}>
                  {AD_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField
            id="ad-start"
            label="Start date"
            required
            error={fieldError(errors, 'startDate')}
          >
            <Input
              id="ad-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </FormField>
          <FormField
            id="ad-expiry"
            label="Expiry date"
            required
            error={fieldError(errors, 'expiryDate')}
          >
            <Input
              id="ad-expiry"
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
            />
          </FormField>
          <FormField
            id="ad-reminder"
            label="Reminder"
            hint="Creates a follow-up task on this date."
            error={fieldError(errors, 'reminderOn')}
          >
            <Input
              id="ad-reminder"
              type="date"
              value={reminderOn}
              onChange={(e) => setReminderOn(e.target.value)}
            />
          </FormField>
          <FormField
            id="ad-notes"
            label="Notes"
            className="sm:col-span-2"
            error={fieldError(errors, 'notes')}
          >
            <Textarea
              id="ad-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </FormField>
        </div>
      )}
    </ActionDialog>
  );
}

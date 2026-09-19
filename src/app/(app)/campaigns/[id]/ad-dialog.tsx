'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { type ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { FormErrorAlert } from '@/components/form-error-alert';
import { FormField } from '@/components/form-field';
import { SubmitButton } from '@/components/submit-button';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { Advertisement } from '@/lib/db/schema/campaigns';
import { useFormDialog } from '@/lib/hooks/use-form-dialog';
import { upsertAdvertisementAction } from '@/modules/campaigns/actions';
import { type UpsertAdInput, UpsertAdSchema } from '@/modules/campaigns/schemas';

type Props = { trigger: ReactElement; campaignId: string; initial?: Advertisement };

export function AdDialog({ trigger, campaignId, initial }: Props) {
  const isEdit = Boolean(initial);
  const form = useForm<UpsertAdInput>({
    resolver: zodResolver(UpsertAdSchema),
    defaultValues: {
      id: initial?.id,
      campaignId,
      country: initial?.country ?? '',
      platform: initial?.platform ?? '',
      targetApplicants: initial?.targetApplicants ?? 20,
      startDate: initial?.startDate ?? new Date().toISOString().slice(0, 10),
      expiryDate:
        initial?.expiryDate ??
        new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      reminderOn: initial?.reminderOn ?? '',
      status: initial?.status ?? 'DRAFT',
      notes: initial?.notes ?? '',
    },
  });
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = form;
  const { open, onOpenChange, formError, submit } = useFormDialog(form);

  const onSubmit = handleSubmit((data) =>
    submit(data, upsertAdvertisementAction, {
      successMessage: isEdit ? 'Ad updated' : 'Ad created',
    }),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit advertisement' : 'New advertisement'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="grid grid-cols-2 gap-3">
            <FormField id="ad-country" label="Country" error={errors.country?.message}>
              <Input
                id="ad-country"
                aria-invalid={Boolean(errors.country)}
                {...register('country')}
              />
            </FormField>
            <FormField id="ad-platform" label="Platform">
              <Input
                id="ad-platform"
                placeholder="e.g. LinkedIn, JobsIE"
                {...register('platform')}
              />
            </FormField>
          </div>
          <FormField
            id="ad-target"
            label="Target applicants"
            hint="Number of applicants to aim for — can exceed the linked requisition's vacancy count."
          >
            <Input
              id="ad-target"
              type="number"
              min={1}
              max={9999}
              aria-invalid={Boolean(errors.targetApplicants)}
              {...register('targetApplicants', { valueAsNumber: true })}
            />
          </FormField>
          <div className="grid grid-cols-3 gap-3">
            <FormField id="ad-start" label="Start">
              <Input
                id="ad-start"
                type="date"
                aria-invalid={Boolean(errors.startDate)}
                {...register('startDate')}
              />
            </FormField>
            <FormField id="ad-expiry" label="Expiry">
              <Input
                id="ad-expiry"
                type="date"
                aria-invalid={Boolean(errors.expiryDate)}
                {...register('expiryDate')}
              />
            </FormField>
            <FormField id="ad-status" label="Status">
              <Select id="ad-status" {...register('status')}>
                <option value="DRAFT">Draft</option>
                <option value="ACTIVE">Active</option>
                <option value="EXPIRED">Expired</option>
                <option value="CLOSED">Closed</option>
              </Select>
            </FormField>
          </div>
          <FormField
            id="ad-reminder"
            label="Reminder date"
            hint="A follow-up task fires on this date. Clear the field to remove the reminder."
          >
            <Input id="ad-reminder" type="date" {...register('reminderOn')} />
          </FormField>
          <FormField id="ad-notes" label="Notes">
            <Textarea id="ad-notes" rows={2} {...register('notes')} />
          </FormField>
          <FormErrorAlert error={formError} />
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <SubmitButton loading={isSubmitting}>
              {isEdit ? 'Save' : 'Create ad'}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

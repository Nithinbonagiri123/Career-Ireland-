'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { ReactElement } from 'react';
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
import type { RecruitmentCampaign } from '@/lib/db/schema/campaigns';
import type { JobRequisition } from '@/lib/db/schema/recruitment';
import { useFormDialog } from '@/lib/hooks/use-form-dialog';
import { upsertCampaignAction } from '@/modules/campaigns/actions';
import { type UpsertCampaignInput, UpsertCampaignSchema } from '@/modules/campaigns/schemas';

type Props = {
  trigger: ReactElement;
  requisitions: JobRequisition[];
  initial?: RecruitmentCampaign;
};

export function CampaignDialog({ trigger, requisitions, initial }: Props) {
  const isEdit = Boolean(initial);
  const form = useForm<UpsertCampaignInput>({
    resolver: zodResolver(UpsertCampaignSchema),
    defaultValues: {
      id: initial?.id,
      jobRequisitionId: initial?.jobRequisitionId ?? '',
      name: initial?.name ?? '',
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
    submit(data, upsertCampaignAction, {
      successMessage: isEdit ? 'Campaign updated' : 'Campaign created',
    }),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit campaign' : 'New recruitment campaign'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <FormField id="cm-name" label="Name" error={errors.name?.message}>
            <Input id="cm-name" aria-invalid={Boolean(errors.name)} {...register('name')} />
          </FormField>
          <FormField id="cm-req" label="Job requisition (optional)">
            <Select id="cm-req" {...register('jobRequisitionId')}>
              <option value="">— standalone campaign —</option>
              {requisitions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField id="cm-status" label="Status">
            <Select id="cm-status" {...register('status')}>
              <option value="DRAFT">Draft</option>
              <option value="ACTIVE">Active</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </Select>
          </FormField>
          <FormField id="cm-notes" label="Notes">
            <Textarea id="cm-notes" rows={3} {...register('notes')} />
          </FormField>
          <FormErrorAlert error={formError} />
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <SubmitButton loading={isSubmitting}>
              {isEdit ? 'Save' : 'Create campaign'}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

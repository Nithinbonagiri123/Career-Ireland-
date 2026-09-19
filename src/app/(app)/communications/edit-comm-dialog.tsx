'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
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
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toastResult } from '@/lib/toast-result';
import { updateCommunicationAction } from '@/modules/activities/actions';
import {
  type UpdateCommunicationInput,
  UpdateCommunicationSchema,
} from '@/modules/activities/schemas';
import type { CommunicationRow } from '@/modules/activities/service';

/**
 * Edit a logged communication. Subject FKs (person/employer/requisition/…)
 * are immutable — you can only fix the freetext content and metadata.
 * Editing an archived row is refused server-side.
 */
export function EditCommDialog({
  comm,
  onOpenChange,
}: {
  comm: CommunicationRow | null;
  onOpenChange: (next: boolean) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<UpdateCommunicationInput>({
    resolver: zodResolver(UpdateCommunicationSchema),
    defaultValues: emptyDefaults(),
  });

  useEffect(() => {
    if (comm) {
      reset({
        communicationId: comm.id,
        type: comm.type,
        direction: comm.direction,
        occurredAt: comm.occurredAt ? new Date(comm.occurredAt).toISOString().slice(0, 16) : '',
        subject: comm.subject ?? '',
        body: comm.body ?? '',
        followUpRequired: comm.followUpRequired,
      });
    } else {
      reset(emptyDefaults());
    }
  }, [comm, reset]);

  const onSubmit = handleSubmit(async (raw) => {
    const payload: UpdateCommunicationInput = {
      ...raw,
      occurredAt: raw.occurredAt ? new Date(raw.occurredAt).toISOString() : '',
    };
    const r = await updateCommunicationAction(payload);
    if (toastResult(r, { success: 'Communication updated' })) onOpenChange(false);
  });

  return (
    <Dialog open={comm !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit communication</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <input type="hidden" {...register('communicationId')} />

          <div className="grid grid-cols-2 gap-4">
            <FormField id="type" label="Type">
              <Select id="type" {...register('type')}>
                <option value="EMAIL">Email</option>
                <option value="PHONE">Phone</option>
                <option value="MEETING">Meeting</option>
                <option value="INTERNAL_NOTE">Internal note</option>
                <option value="OTHER">Other</option>
              </Select>
            </FormField>
            <FormField id="direction" label="Direction">
              <Select id="direction" {...register('direction')}>
                <option value="OUTBOUND">Outbound</option>
                <option value="INBOUND">Inbound</option>
                <option value="INTERNAL">Internal</option>
              </Select>
            </FormField>
          </div>

          <FormField id="occurredAt" label="Occurred at">
            <Input id="occurredAt" type="datetime-local" {...register('occurredAt')} />
          </FormField>

          <FormField id="subject" label="Subject">
            <Input id="subject" {...register('subject')} />
          </FormField>

          <FormField id="body" label="Body">
            <Textarea id="body" className="min-h-32" {...register('body')} />
          </FormField>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register('followUpRequired')} />
            <span>Follow-up required</span>
          </label>

          {Object.keys(errors).length > 0 && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
              <span>Fix the errors above and retry.</span>
            </div>
          )}

          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <SubmitButton loading={isSubmitting}>Save changes</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function emptyDefaults(): UpdateCommunicationInput {
  return {
    communicationId: '00000000-0000-4000-8000-000000000000',
    type: 'EMAIL',
    direction: 'OUTBOUND',
    occurredAt: '',
    subject: '',
    body: '',
    followUpRequired: false,
  };
}

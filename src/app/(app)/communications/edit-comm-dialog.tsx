'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
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
import { Label } from '@/components/ui/label';
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
    if (r.ok) {
      toast.success('Communication updated');
      onOpenChange(false);
    } else {
      toast.error(r.error.message);
    }
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
            <div className="space-y-1.5">
              <Label htmlFor="type">Type</Label>
              <select
                id="type"
                className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                {...register('type')}
              >
                <option value="EMAIL">Email</option>
                <option value="PHONE">Phone</option>
                <option value="MEETING">Meeting</option>
                <option value="INTERNAL_NOTE">Internal note</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="direction">Direction</Label>
              <select
                id="direction"
                className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                {...register('direction')}
              >
                <option value="OUTBOUND">Outbound</option>
                <option value="INBOUND">Inbound</option>
                <option value="INTERNAL">Internal</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="occurredAt">Occurred at</Label>
            <Input id="occurredAt" type="datetime-local" {...register('occurredAt')} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="subject">Subject</Label>
            <Input id="subject" {...register('subject')} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="body">Body</Label>
            <textarea
              id="body"
              className="min-h-32 w-full rounded-md border border-input bg-background p-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              {...register('body')}
            />
          </div>

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
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
              Save changes
            </Button>
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

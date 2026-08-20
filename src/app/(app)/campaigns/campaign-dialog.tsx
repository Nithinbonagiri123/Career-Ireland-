'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { motion } from 'framer-motion';
import { AlertCircle, Loader2 } from 'lucide-react';
import { type ReactElement, useState } from 'react';
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
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { RecruitmentCampaign } from '@/lib/db/schema/campaigns';
import type { JobRequisition } from '@/lib/db/schema/recruitment';
import { upsertCampaignAction } from '@/modules/campaigns/actions';
import { type UpsertCampaignInput, UpsertCampaignSchema } from '@/modules/campaigns/schemas';

type Props = {
  trigger: ReactElement;
  requisitions: JobRequisition[];
  initial?: RecruitmentCampaign;
};

export function CampaignDialog({ trigger, requisitions, initial }: Props) {
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const isEdit = Boolean(initial);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<UpsertCampaignInput>({
    resolver: zodResolver(UpsertCampaignSchema),
    defaultValues: {
      id: initial?.id,
      jobRequisitionId: initial?.jobRequisitionId ?? '',
      name: initial?.name ?? '',
      status: initial?.status ?? 'DRAFT',
      notes: initial?.notes ?? '',
    },
  });

  const onSubmit = handleSubmit(async (data) => {
    setFormError(null);
    const r = await upsertCampaignAction(data);
    if (!r.ok) {
      setFormError(r.error.message);
      return;
    }
    toast.success(isEdit ? 'Campaign updated' : 'Campaign created');
    reset(data);
    setOpen(false);
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          reset();
          setFormError(null);
        }
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit campaign' : 'New recruitment campaign'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="cm-name">Name</Label>
            <Input id="cm-name" aria-invalid={Boolean(errors.name)} {...register('name')} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cm-req">Job requisition (optional)</Label>
            <select
              id="cm-req"
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              {...register('jobRequisitionId')}
            >
              <option value="">— standalone campaign —</option>
              {requisitions.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cm-status">Status</Label>
            <select
              id="cm-status"
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              {...register('status')}
            >
              <option value="DRAFT">Draft</option>
              <option value="ACTIVE">Active</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cm-notes">Notes</Label>
            <textarea
              id="cm-notes"
              rows={3}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              {...register('notes')}
            />
          </div>
          {formError && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
              role="alert"
            >
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
              <span>{formError}</span>
            </motion.div>
          )}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
              {isEdit ? 'Save' : 'Create campaign'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

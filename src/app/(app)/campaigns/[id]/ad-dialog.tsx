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
import type { Advertisement } from '@/lib/db/schema/campaigns';
import { upsertAdvertisementAction } from '@/modules/campaigns/actions';
import { type UpsertAdInput, UpsertAdSchema } from '@/modules/campaigns/schemas';

type Props = { trigger: ReactElement; campaignId: string; initial?: Advertisement };

export function AdDialog({ trigger, campaignId, initial }: Props) {
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const isEdit = Boolean(initial);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<UpsertAdInput>({
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
      status: initial?.status ?? 'DRAFT',
      notes: initial?.notes ?? '',
    },
  });

  const onSubmit = handleSubmit(async (data) => {
    setFormError(null);
    const r = await upsertAdvertisementAction(data);
    if (!r.ok) {
      setFormError(r.error.message);
      return;
    }
    toast.success(isEdit ? 'Ad updated' : 'Ad created');
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
          <DialogTitle>{isEdit ? 'Edit advertisement' : 'New advertisement'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ad-country">Country</Label>
              <Input
                id="ad-country"
                aria-invalid={Boolean(errors.country)}
                {...register('country')}
              />
              {errors.country && (
                <p className="text-xs text-destructive">{errors.country.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ad-platform">Platform</Label>
              <Input
                id="ad-platform"
                placeholder="e.g. LinkedIn, JobsIE"
                {...register('platform')}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ad-target">Target applicants</Label>
            <Input
              id="ad-target"
              type="number"
              min={1}
              max={9999}
              aria-invalid={Boolean(errors.targetApplicants)}
              {...register('targetApplicants', { valueAsNumber: true })}
            />
            <p className="text-xs text-muted-foreground">
              Number of applicants to aim for — can exceed the linked requisition's vacancy count.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ad-start">Start</Label>
              <Input
                id="ad-start"
                type="date"
                aria-invalid={Boolean(errors.startDate)}
                {...register('startDate')}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ad-expiry">Expiry</Label>
              <Input
                id="ad-expiry"
                type="date"
                aria-invalid={Boolean(errors.expiryDate)}
                {...register('expiryDate')}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ad-status">Status</Label>
              <select
                id="ad-status"
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                {...register('status')}
              >
                <option value="DRAFT">Draft</option>
                <option value="ACTIVE">Active</option>
                <option value="EXPIRED">Expired</option>
                <option value="CLOSED">Closed</option>
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ad-notes">Notes</Label>
            <textarea
              id="ad-notes"
              rows={2}
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
              {isEdit ? 'Save' : 'Create ad'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

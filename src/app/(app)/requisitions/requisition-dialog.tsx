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
import type { Currency } from '@/lib/db/schema/currencies';
import type { Occupation } from '@/lib/db/schema/occupations';
import type { Employer, JobRequisition } from '@/lib/db/schema/recruitment';
import { upsertRequisitionAction } from '@/modules/requisitions/actions';
import {
  type UpsertRequisitionInput,
  UpsertRequisitionSchema,
} from '@/modules/requisitions/schemas';

type Props = {
  trigger: ReactElement;
  employers: Employer[];
  occupations: Occupation[];
  currencies: Currency[];
  initial?: JobRequisition;
  defaultEmployerId?: string;
};

export function RequisitionDialog({
  trigger,
  employers,
  occupations,
  currencies,
  initial,
  defaultEmployerId,
}: Props) {
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const isEdit = Boolean(initial);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<UpsertRequisitionInput>({
    resolver: zodResolver(UpsertRequisitionSchema),
    defaultValues: {
      id: initial?.id,
      employerId: initial?.employerId ?? defaultEmployerId ?? employers[0]?.id ?? '',
      primaryContactId: initial?.primaryContactId ?? '',
      title: initial?.title ?? '',
      occupationId: initial?.occupationId ?? '',
      positionsRequired: initial?.positionsRequired ?? 1,
      location: initial?.location ?? '',
      employmentType: initial?.employmentType ?? 'FULL_TIME',
      salaryMin: initial?.salaryMin ?? '',
      salaryMax: initial?.salaryMax ?? '',
      salaryCurrencyCode: initial?.salaryCurrencyCode ?? '',
      description: initial?.description ?? '',
      candidateRequirements: initial?.candidateRequirements ?? '',
      status: initial?.status ?? 'DRAFT',
      assignedUserId: initial?.assignedUserId ?? '',
      targetFillDate: initial?.targetFillDate ?? '',
    },
  });

  const onSubmit = handleSubmit(async (data) => {
    setFormError(null);
    const result = await upsertRequisitionAction(data);
    if (!result.ok) {
      setFormError(result.error.message);
      return;
    }
    toast.success(isEdit ? 'Requisition updated' : 'Requisition created');
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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit requisition' : 'New job requisition'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="jr-employer">Employer</Label>
            <select
              id="jr-employer"
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              {...register('employerId')}
            >
              {employers.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.legalName}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="jr-title">Job title</Label>
            <Input id="jr-title" aria-invalid={Boolean(errors.title)} {...register('title')} />
            {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="jr-occupation">Occupation</Label>
              <select
                id="jr-occupation"
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                {...register('occupationId')}
              >
                <option value="">— none —</option>
                {occupations
                  .filter((o) => o.isActive || o.id === initial?.occupationId)
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="jr-positions">Positions</Label>
              <Input
                id="jr-positions"
                type="number"
                min={1}
                max={999}
                aria-invalid={Boolean(errors.positionsRequired)}
                {...register('positionsRequired', { valueAsNumber: true })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="jr-type">Type</Label>
              <select
                id="jr-type"
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                {...register('employmentType')}
              >
                <option value="FULL_TIME">Full-time</option>
                <option value="PART_TIME">Part-time</option>
                <option value="CONTRACT">Contract</option>
                <option value="TEMP">Temp</option>
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="jr-location">Location</Label>
            <Input id="jr-location" {...register('location')} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="jr-smin">Salary min</Label>
              <Input id="jr-smin" inputMode="decimal" {...register('salaryMin')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="jr-smax">Salary max</Label>
              <Input id="jr-smax" inputMode="decimal" {...register('salaryMax')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="jr-cur">Currency</Label>
              <select
                id="jr-cur"
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                {...register('salaryCurrencyCode')}
              >
                <option value="">— none —</option>
                {currencies
                  .filter((c) => c.isActive || c.code === initial?.salaryCurrencyCode)
                  .map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code}
                    </option>
                  ))}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="jr-desc">Description</Label>
            <textarea
              id="jr-desc"
              rows={3}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              {...register('description')}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="jr-status">Status</Label>
              <select
                id="jr-status"
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                {...register('status')}
              >
                <option value="DRAFT">Draft</option>
                <option value="OPEN">Open</option>
                <option value="IN_PROGRESS">In progress</option>
                <option value="PARTIALLY_FILLED">Partially filled</option>
                <option value="FILLED">Filled</option>
                <option value="CLOSED">Closed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="jr-target">Target fill date</Label>
              <Input id="jr-target" type="date" {...register('targetFillDate')} />
            </div>
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
              {isEdit ? 'Save' : 'Create requisition'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

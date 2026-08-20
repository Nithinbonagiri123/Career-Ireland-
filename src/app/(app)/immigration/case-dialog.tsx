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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ImmigrationCase } from '@/lib/db/schema/immigration';
import type { Person } from '@/lib/db/schema/persons';
import type { Employer } from '@/lib/db/schema/recruitment';
import { upsertCaseAction } from '@/modules/immigration/actions';
import { type UpsertCaseInput, UpsertCaseSchema } from '@/modules/immigration/schemas';

type Props = {
  trigger: ReactElement;
  persons: Person[];
  employers: Employer[];
  initial?: ImmigrationCase;
};

export function CaseDialog({ trigger, persons, employers, initial }: Props) {
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const isEdit = Boolean(initial);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<UpsertCaseInput>({
    resolver: zodResolver(UpsertCaseSchema),
    defaultValues: {
      id: initial?.id,
      caseType: initial?.caseType ?? 'EMPLOYMENT_PERMIT',
      beneficiaryPersonId: initial?.beneficiaryPersonId ?? '',
      sponsorEmployerId: initial?.sponsorEmployerId ?? '',
      relatedPlacementId: initial?.relatedPlacementId ?? '',
      relatedJobRequisitionId: initial?.relatedJobRequisitionId ?? '',
      serviceEngagementId: initial?.serviceEngagementId ?? '',
      status: initial?.status ?? 'OPEN',
      authorityReference: initial?.authorityReference ?? '',
      submittedAt: initial?.submittedAt ?? '',
      decisionAt: initial?.decisionAt ?? '',
      expiresOn: initial?.expiresOn ?? '',
      notes: initial?.notes ?? '',
    },
  });

  const onSubmit = handleSubmit(async (data) => {
    setFormError(null);
    const r = await upsertCaseAction(data);
    if (!r.ok) {
      setFormError(r.error.message);
      return;
    }
    toast.success(isEdit ? 'Case updated' : 'Case opened');
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
          <DialogTitle>{isEdit ? 'Edit immigration case' : 'Open immigration case'}</DialogTitle>
          <DialogDescription>
            Permit, Visa, and Visa Extension cases share this form. A case does not need to link to
            a Career Ireland placement — independent employer-driven cases are supported.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ic-type">Case type</Label>
              <select
                id="ic-type"
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                {...register('caseType')}
              >
                <option value="EMPLOYMENT_PERMIT">Employment permit</option>
                <option value="VISA">Visa</option>
                <option value="VISA_EXTENSION">Visa extension</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ic-status">Status</Label>
              <select
                id="ic-status"
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                {...register('status')}
              >
                <option value="OPEN">Open</option>
                <option value="DOCUMENTS_PENDING">Documents pending</option>
                <option value="SUBMITTED">Submitted</option>
                <option value="UNDER_AUTHORITY_REVIEW">Under authority review</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
                <option value="CLOSED">Closed</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ic-beneficiary">Beneficiary</Label>
            <select
              id="ic-beneficiary"
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              aria-invalid={Boolean(errors.beneficiaryPersonId)}
              {...register('beneficiaryPersonId')}
            >
              <option value="">— select person —</option>
              {persons.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.firstName} {p.lastName}
                </option>
              ))}
            </select>
            {errors.beneficiaryPersonId && (
              <p className="text-xs text-destructive">{errors.beneficiaryPersonId.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ic-sponsor">Sponsor employer (optional)</Label>
            <select
              id="ic-sponsor"
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              {...register('sponsorEmployerId')}
            >
              <option value="">— none —</option>
              {employers.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.legalName}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ic-submitted">Submitted</Label>
              <Input id="ic-submitted" type="date" {...register('submittedAt')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ic-decision">Decision</Label>
              <Input id="ic-decision" type="date" {...register('decisionAt')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ic-expires">Expires</Label>
              <Input id="ic-expires" type="date" {...register('expiresOn')} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ic-ref">Authority reference</Label>
            <Input id="ic-ref" placeholder="Govt case number" {...register('authorityReference')} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ic-notes">Notes</Label>
            <textarea
              id="ic-notes"
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
              {isEdit ? 'Save' : 'Open case'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

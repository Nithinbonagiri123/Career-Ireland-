'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, AlertTriangle, ExternalLink, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { type ReactElement, useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
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
import type { Employer } from '@/lib/db/schema/recruitment';
import { findSimilarEmployersAction, upsertEmployerAction } from '@/modules/employers/actions';
import { type UpsertEmployerInput, UpsertEmployerSchema } from '@/modules/employers/schemas';
import type { SimilarEmployer } from '@/modules/employers/service';

type Props = { trigger: ReactElement; initial?: Employer };

export function EmployerDialog({ trigger, initial }: Props) {
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [similar, setSimilar] = useState<SimilarEmployer[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const isEdit = Boolean(initial);

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<UpsertEmployerInput>({
    resolver: zodResolver(UpsertEmployerSchema),
    defaultValues: {
      id: initial?.id,
      legalName: initial?.legalName ?? '',
      tradingName: initial?.tradingName ?? '',
      website: initial?.website ?? '',
      industry: initial?.industry ?? '',
      country: initial?.country ?? '',
      city: initial?.city ?? '',
      relationshipStatus: initial?.relationshipStatus ?? 'PROSPECT',
      assignedUserId: initial?.assignedUserId ?? '',
      notes: initial?.notes ?? '',
    },
  });

  // Debounced duplicate detection — only on create, not edit.
  const legalName = useWatch({ control, name: 'legalName' });
  const tradingName = useWatch({ control, name: 'tradingName' });
  const website = useWatch({ control, name: 'website' });

  useEffect(() => {
    if (isEdit) return;
    setDismissed(false);
    const anyLongEnough =
      (legalName && legalName.trim().length >= 3) ||
      (tradingName && tradingName.trim().length >= 3) ||
      (website && website.trim().length >= 4);
    if (!anyLongEnough) {
      setSimilar([]);
      return;
    }
    const t = setTimeout(async () => {
      const r = await findSimilarEmployersAction({
        legalName: legalName ?? undefined,
        tradingName: tradingName ?? undefined,
        website: website ?? undefined,
      });
      if (r.ok) setSimilar(r.data);
    }, 250);
    return () => clearTimeout(t);
  }, [isEdit, legalName, tradingName, website]);

  const onSubmit = handleSubmit(async (data) => {
    setFormError(null);
    const result = await upsertEmployerAction(data);
    if (!result.ok) {
      setFormError(result.error.message);
      return;
    }
    toast.success(isEdit ? 'Employer updated' : 'Employer added');
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
          <DialogTitle>{isEdit ? 'Edit employer' : 'Add employer'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="em-legal">Legal name</Label>
            <Input
              id="em-legal"
              aria-invalid={Boolean(errors.legalName)}
              {...register('legalName')}
            />
            {errors.legalName && (
              <p className="text-xs text-destructive">{errors.legalName.message}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="em-trading">Trading name</Label>
              <Input id="em-trading" {...register('tradingName')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="em-industry">Industry</Label>
              <Input id="em-industry" {...register('industry')} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="em-website">Website</Label>
              <Input id="em-website" {...register('website')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="em-status">Status</Label>
              <select
                id="em-status"
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                {...register('relationshipStatus')}
              >
                <option value="PROSPECT">Prospect</option>
                <option value="ACTIVE">Active</option>
                <option value="ON_HOLD">On hold</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="em-country">Country</Label>
              <Input id="em-country" {...register('country')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="em-city">City</Label>
              <Input id="em-city" {...register('city')} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="em-notes">Notes</Label>
            <textarea
              id="em-notes"
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
          <AnimatePresence>
            {!isEdit && similar.length > 0 && !dismissed && (
              <motion.div
                key="sim"
                initial={{ opacity: 0, y: -4, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: -4, height: 0 }}
                transition={{ duration: 0.18 }}
                className="overflow-hidden"
              >
                <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-amber-800 dark:text-amber-300">
                        {similar.length} similar employer{similar.length === 1 ? '' : 's'} found —
                        is this a duplicate?
                      </p>
                      <ul className="mt-2 space-y-1">
                        {similar.map((s) => (
                          <li key={s.employer.id}>
                            <Link
                              href={`/employers/${s.employer.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 hover:underline"
                            >
                              <span className="font-medium">{s.employer.legalName}</span>
                              {s.employer.tradingName &&
                                s.employer.tradingName !== s.employer.legalName && (
                                  <span className="text-muted-foreground">
                                    ({s.employer.tradingName})
                                  </span>
                                )}
                              <span className="text-[10px] text-muted-foreground">
                                ·{' '}
                                {s.reasons
                                  .map((r) => r.replace(/_/g, ' ').toLowerCase())
                                  .join(', ')}
                              </span>
                              <ExternalLink className="size-3 opacity-60" />
                            </Link>
                          </li>
                        ))}
                      </ul>
                      <button
                        type="button"
                        onClick={() => setDismissed(true)}
                        className="mt-2 text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
                      >
                        These are all different — dismiss and continue
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
              {isEdit ? 'Save' : 'Add employer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

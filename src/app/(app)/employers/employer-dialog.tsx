'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { type ReactElement, useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
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
import type { Employer } from '@/lib/db/schema/recruitment';
import { useFormDialog } from '@/lib/hooks/use-form-dialog';
import { findSimilarEmployersAction, upsertEmployerAction } from '@/modules/employers/actions';
import { type UpsertEmployerInput, UpsertEmployerSchema } from '@/modules/employers/schemas';
import type { SimilarEmployer } from '@/modules/employers/service';

type Props = { trigger: ReactElement; initial?: Employer };

export function EmployerDialog({ trigger, initial }: Props) {
  const [similar, setSimilar] = useState<SimilarEmployer[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const isEdit = Boolean(initial);

  const form = useForm<UpsertEmployerInput>({
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
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = form;
  const { open, onOpenChange, formError, submit } = useFormDialog(form);

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

  const onSubmit = handleSubmit((data) =>
    submit(data, upsertEmployerAction, {
      successMessage: isEdit ? 'Employer updated' : 'Employer added',
    }),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit employer' : 'Add employer'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <FormField id="em-legal" label="Legal name" error={errors.legalName?.message}>
            <Input
              id="em-legal"
              aria-invalid={Boolean(errors.legalName)}
              {...register('legalName')}
            />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField id="em-trading" label="Trading name">
              <Input id="em-trading" {...register('tradingName')} />
            </FormField>
            <FormField id="em-industry" label="Industry">
              <Input id="em-industry" {...register('industry')} />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField id="em-website" label="Website">
              <Input id="em-website" {...register('website')} />
            </FormField>
            <FormField id="em-status" label="Status">
              <Select id="em-status" {...register('relationshipStatus')}>
                <option value="PROSPECT">Prospect</option>
                <option value="ACTIVE">Active</option>
                <option value="ON_HOLD">On hold</option>
                <option value="ARCHIVED">Archived</option>
              </Select>
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField id="em-country" label="Country">
              <Input id="em-country" {...register('country')} />
            </FormField>
            <FormField id="em-city" label="City">
              <Input id="em-city" {...register('city')} />
            </FormField>
          </div>
          <FormField id="em-notes" label="Notes">
            <Textarea id="em-notes" rows={3} {...register('notes')} />
          </FormField>
          <FormErrorAlert error={formError} />
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
                <div className="rounded-md border border-status-warning/40 bg-status-warning-soft p-3 text-xs">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-status-warning" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-status-warning ">
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
            <SubmitButton loading={isSubmitting}>{isEdit ? 'Save' : 'Add employer'}</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

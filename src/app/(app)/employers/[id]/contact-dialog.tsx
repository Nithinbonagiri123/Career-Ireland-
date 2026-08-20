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
import type { EmployerContact } from '@/lib/db/schema/recruitment';
import { upsertEmployerContactAction } from '@/modules/employers/actions';
import { type UpsertContactInput, UpsertContactSchema } from '@/modules/employers/schemas';

type Props = { trigger: ReactElement; employerId: string; initial?: EmployerContact };

export function ContactDialog({ trigger, employerId, initial }: Props) {
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const isEdit = Boolean(initial);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<UpsertContactInput>({
    resolver: zodResolver(UpsertContactSchema),
    defaultValues: {
      id: initial?.id,
      employerId,
      fullName: initial?.fullName ?? '',
      jobTitle: initial?.jobTitle ?? '',
      email: initial?.email ?? '',
      phone: initial?.phone ?? '',
      isPrimary: initial?.isPrimary ?? false,
    },
  });

  const onSubmit = handleSubmit(async (data) => {
    setFormError(null);
    const result = await upsertEmployerContactAction(data);
    if (!result.ok) {
      setFormError(result.error.message);
      return;
    }
    toast.success(isEdit ? 'Contact updated' : 'Contact added');
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
          <DialogTitle>{isEdit ? 'Edit contact' : 'Add contact'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="c-name">Full name</Label>
            <Input id="c-name" aria-invalid={Boolean(errors.fullName)} {...register('fullName')} />
            {errors.fullName && (
              <p className="text-xs text-destructive">{errors.fullName.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-title">Job title</Label>
            <Input id="c-title" {...register('jobTitle')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="c-email">Email</Label>
              <Input id="c-email" type="email" {...register('email')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-phone">Phone</Label>
              <Input id="c-phone" type="tel" {...register('phone')} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register('isPrimary')} className="size-4 accent-accent" />
            Primary contact (only one primary per employer)
          </label>
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
              {isEdit ? 'Save' : 'Add contact'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

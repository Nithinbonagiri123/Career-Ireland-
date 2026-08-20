'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { motion } from 'framer-motion';
import { AlertCircle, Loader2, Plus } from 'lucide-react';
import { useState } from 'react';
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
import { Label } from '@/components/ui/label';
import type { Person } from '@/lib/db/schema/persons';
import { createProspectAction } from '@/modules/campaigns/actions';
import { type CreateProspectInput, CreateProspectSchema } from '@/modules/campaigns/schemas';

export function ProspectIntakeDialog({
  advertisementId,
  persons,
}: {
  advertisementId: string;
  persons: Person[];
}) {
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateProspectInput>({
    resolver: zodResolver(CreateProspectSchema),
    defaultValues: { advertisementId, personId: '' },
  });

  const onSubmit = handleSubmit(async (data) => {
    setFormError(null);
    const r = await createProspectAction(data);
    if (!r.ok) {
      setFormError(r.error.message);
      return;
    }
    toast.success('Prospect recorded');
    reset({ advertisementId, personId: '' });
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
      <DialogTrigger
        render={
          <Button size="sm" variant="outline">
            <Plus className="mr-1.5 size-4" /> Add prospect
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record a prospect for this ad</DialogTitle>
          <DialogDescription>
            Pick an existing Person. If they're new to the system, create them first via Leads (with
            dedup check).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="pr-person">Person</Label>
            <select
              id="pr-person"
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              aria-invalid={Boolean(errors.personId)}
              {...register('personId')}
            >
              <option value="">— select person —</option>
              {persons.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.firstName} {p.lastName} — {p.email ?? p.phone ?? 'no contact'}
                </option>
              ))}
            </select>
            {errors.personId && (
              <p className="text-xs text-destructive">{errors.personId.message}</p>
            )}
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
              Record prospect
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { motion } from 'framer-motion';
import { AlertCircle, ArrowRight, GitMerge, Loader2 } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Person } from '@/lib/db/schema/persons';
import { mergePersonsAction } from '@/modules/persons/actions';
import { type MergePersonsInput, MergePersonsSchema } from '@/modules/persons/schemas';

export function MergePersonsDialog({ persons }: { persons: Person[] }) {
  const [open, setOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<MergePersonsInput>({
    resolver: zodResolver(MergePersonsSchema),
    defaultValues: { loserPersonId: '', survivorPersonId: '', reason: '' },
  });

  const loserId = watch('loserPersonId');
  const survivorId = watch('survivorPersonId');
  const loser = persons.find((p) => p.id === loserId);
  const survivor = persons.find((p) => p.id === survivorId);

  const onSubmit = handleSubmit(async (data) => {
    setFormError(null);
    const r = await mergePersonsAction(data);
    if (!r.ok) {
      setFormError(r.error.message);
      return;
    }
    toast.success('Persons merged — all leads / candidate profiles repointed to survivor');
    reset();
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
          <Button size="sm">
            <GitMerge className="mr-1.5 size-4" /> Merge persons
          </Button>
        }
      />
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Merge duplicate persons</DialogTitle>
          <DialogDescription>
            The loser's leads, applications, matches, placements will be repointed to the survivor.
            The loser record stays (marked merged) so audit history is preserved.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="mp-loser">Loser (will be merged away)</Label>
            <select
              id="mp-loser"
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              {...register('loserPersonId')}
            >
              <option value="">— select loser —</option>
              {persons.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.firstName} {p.lastName} — {p.email ?? p.phone ?? '(no contact)'}
                </option>
              ))}
            </select>
          </div>

          {loser && survivor && (
            <div className="flex items-center justify-center gap-3 rounded-md bg-muted/40 p-3 text-xs">
              <span className="font-medium">
                {loser.firstName} {loser.lastName}
              </span>
              <ArrowRight className="size-4 text-muted-foreground" />
              <span className="font-medium">
                {survivor.firstName} {survivor.lastName}
              </span>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="mp-survivor">Survivor (the "real" record)</Label>
            <select
              id="mp-survivor"
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              {...register('survivorPersonId')}
            >
              <option value="">— select survivor —</option>
              {persons
                .filter((p) => p.id !== loserId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.firstName} {p.lastName} — {p.email ?? p.phone ?? '(no contact)'}
                  </option>
                ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mp-reason">Reason (audited)</Label>
            <Input
              id="mp-reason"
              placeholder="e.g. Same person, entered twice via lead + campaign"
              aria-invalid={Boolean(errors.reason)}
              {...register('reason')}
            />
            {errors.reason && <p className="text-xs text-destructive">{errors.reason.message}</p>}
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
              Merge
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

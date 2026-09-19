'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, GitMerge } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { FormErrorAlert } from '@/components/form-error-alert';
import { FormField } from '@/components/form-field';
import { SubmitButton } from '@/components/submit-button';
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
import { Select } from '@/components/ui/select';
import type { Person } from '@/lib/db/schema/persons';
import { useFormDialog } from '@/lib/hooks/use-form-dialog';
import { mergePersonsAction } from '@/modules/persons/actions';
import { type MergePersonsInput, MergePersonsSchema } from '@/modules/persons/schemas';

export function MergePersonsDialog({ persons }: { persons: Person[] }) {
  const form = useForm<MergePersonsInput>({
    resolver: zodResolver(MergePersonsSchema),
    defaultValues: { loserPersonId: '', survivorPersonId: '', reason: '' },
  });
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = form;
  const { open, onOpenChange, formError, submit } = useFormDialog(form);

  const loserId = watch('loserPersonId');
  const survivorId = watch('survivorPersonId');
  const loser = persons.find((p) => p.id === loserId);
  const survivor = persons.find((p) => p.id === survivorId);

  const onSubmit = handleSubmit((data) =>
    submit(data, mergePersonsAction, {
      successMessage: 'Persons merged — all leads / candidate profiles repointed to survivor',
    }),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
          <FormField id="mp-loser" label="Loser (will be merged away)">
            <Select id="mp-loser" {...register('loserPersonId')}>
              <option value="">— select loser —</option>
              {persons.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.firstName} {p.lastName} — {p.email ?? p.phone ?? '(no contact)'}
                </option>
              ))}
            </Select>
          </FormField>

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

          <FormField id="mp-survivor" label='Survivor (the "real" record)'>
            <Select id="mp-survivor" {...register('survivorPersonId')}>
              <option value="">— select survivor —</option>
              {persons
                .filter((p) => p.id !== loserId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.firstName} {p.lastName} — {p.email ?? p.phone ?? '(no contact)'}
                  </option>
                ))}
            </Select>
          </FormField>

          <FormField id="mp-reason" label="Reason (audited)" error={errors.reason?.message}>
            <Input
              id="mp-reason"
              placeholder="e.g. Same person, entered twice via lead + campaign"
              aria-invalid={Boolean(errors.reason)}
              {...register('reason')}
            />
          </FormField>

          <FormErrorAlert error={formError} />

          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <SubmitButton loading={isSubmitting}>Merge</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

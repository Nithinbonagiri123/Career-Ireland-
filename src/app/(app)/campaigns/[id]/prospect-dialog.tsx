'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
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
import { Select } from '@/components/ui/select';
import type { Person } from '@/lib/db/schema/persons';
import { useFormDialog } from '@/lib/hooks/use-form-dialog';
import { createProspectAction } from '@/modules/campaigns/actions';
import { type CreateProspectInput, CreateProspectSchema } from '@/modules/campaigns/schemas';

export function ProspectIntakeDialog({
  advertisementId,
  persons,
}: {
  advertisementId: string;
  persons: Person[];
}) {
  const form = useForm<CreateProspectInput>({
    resolver: zodResolver(CreateProspectSchema),
    defaultValues: { advertisementId, personId: '' },
  });
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = form;
  const { open, onOpenChange, formError, submit } = useFormDialog(form);

  const onSubmit = handleSubmit((data) =>
    submit(data, createProspectAction, { successMessage: 'Prospect recorded' }),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
          <FormField id="pr-person" label="Person" error={errors.personId?.message}>
            <Select
              id="pr-person"
              aria-invalid={Boolean(errors.personId)}
              {...register('personId')}
            >
              <option value="">— select person —</option>
              {persons.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.firstName} {p.lastName} — {p.email ?? p.phone ?? 'no contact'}
                </option>
              ))}
            </Select>
          </FormField>
          <FormErrorAlert error={formError} />
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <SubmitButton loading={isSubmitting}>Record prospect</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

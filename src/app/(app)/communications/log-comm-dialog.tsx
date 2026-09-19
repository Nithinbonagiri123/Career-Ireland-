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
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { Person } from '@/lib/db/schema/persons';
import type { Employer } from '@/lib/db/schema/recruitment';
import { useFormDialog } from '@/lib/hooks/use-form-dialog';
import { createCommunicationAction } from '@/modules/activities/actions';
import {
  type CreateCommunicationInput,
  CreateCommunicationSchema,
} from '@/modules/activities/schemas';

type Props = { persons: Person[]; employers: Employer[] };

export function LogCommDialog({ persons, employers }: Props) {
  const form = useForm<CreateCommunicationInput>({
    resolver: zodResolver(CreateCommunicationSchema),
    defaultValues: {
      type: 'EMAIL',
      direction: 'OUTBOUND',
      occurredAt: '',
      subject: '',
      body: '',
      personId: '',
      employerId: '',
      employerContactId: '',
      jobRequisitionId: '',
      serviceEngagementId: '',
      immigrationCaseId: '',
      followUpRequired: false,
    },
  });
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = form;
  const { open, onOpenChange, formError, submit } = useFormDialog(form);

  const onSubmit = handleSubmit((data) =>
    submit(data, createCommunicationAction, { successMessage: 'Communication logged' }),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button size="sm">
            <Plus className="mr-1.5 size-4" /> Log communication
          </Button>
        }
      />
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Log a communication</DialogTitle>
          <DialogDescription>
            Attach to at least one subject (person, employer, requisition, engagement, or case).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="grid grid-cols-2 gap-3">
            <FormField id="cl-type" label="Type">
              <Select id="cl-type" {...register('type')}>
                <option value="EMAIL">Email</option>
                <option value="PHONE">Phone</option>
                <option value="MEETING">Meeting</option>
                <option value="INTERNAL_NOTE">Internal note</option>
                <option value="OTHER">Other</option>
              </Select>
            </FormField>
            <FormField id="cl-dir" label="Direction">
              <Select id="cl-dir" {...register('direction')}>
                <option value="OUTBOUND">Outbound</option>
                <option value="INBOUND">Inbound</option>
                <option value="INTERNAL">Internal</option>
              </Select>
            </FormField>
          </div>
          <FormField id="cl-subject" label="Subject">
            <Input id="cl-subject" {...register('subject')} />
          </FormField>
          <FormField id="cl-body" label="Body / notes">
            <Textarea id="cl-body" rows={4} {...register('body')} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField id="cl-person" label="Person" error={errors.personId?.message}>
              <Select id="cl-person" {...register('personId')}>
                <option value="">— none —</option>
                {persons.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.firstName} {p.lastName}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField id="cl-employer" label="Employer">
              <Select id="cl-employer" {...register('employerId')}>
                <option value="">— none —</option>
                {employers.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.legalName}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              {...register('followUpRequired')}
              className="size-4 accent-accent"
            />
            Follow-up required (auto-creates a task assigned to me)
          </label>
          <FormErrorAlert error={formError} />
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <SubmitButton loading={isSubmitting}>Log</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

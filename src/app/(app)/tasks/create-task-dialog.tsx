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
import { createTaskAction } from '@/modules/activities/actions';
import { type CreateTaskInput, CreateTaskSchema } from '@/modules/activities/schemas';
import type { UserListRow } from '@/modules/users/repository';

type Props = { users: UserListRow[]; persons: Person[]; employers: Employer[] };

export function CreateTaskDialog({ users, persons, employers }: Props) {
  const form = useForm<CreateTaskInput>({
    resolver: zodResolver(CreateTaskSchema),
    defaultValues: {
      title: '',
      description: '',
      dueAt: '',
      assignedUserId: users[0]?.id ?? '',
      priority: 'NORMAL',
      personId: '',
      employerId: '',
      jobRequisitionId: '',
      serviceEngagementId: '',
      immigrationCaseId: '',
    },
  });
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = form;
  const { open, onOpenChange, formError, submit } = useFormDialog(form);

  const onSubmit = handleSubmit((data) =>
    submit(data, createTaskAction, { successMessage: 'Task created' }),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button size="sm">
            <Plus className="mr-1.5 size-4" /> New task
          </Button>
        }
      />
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create a task</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <FormField id="tk-title" label="Title" error={errors.title?.message}>
            <Input id="tk-title" aria-invalid={Boolean(errors.title)} {...register('title')} />
          </FormField>
          <FormField id="tk-desc" label="Description">
            <Textarea id="tk-desc" rows={3} {...register('description')} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField id="tk-due" label="Due">
              <Input id="tk-due" type="datetime-local" {...register('dueAt')} />
            </FormField>
            <FormField id="tk-priority" label="Priority">
              <Select id="tk-priority" {...register('priority')}>
                <option value="LOW">Low</option>
                <option value="NORMAL">Normal</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </Select>
            </FormField>
          </div>
          <FormField id="tk-assign" label="Assign to">
            <Select id="tk-assign" {...register('assignedUserId')}>
              {users
                .filter((u) => u.isActive)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName} ({u.role})
                  </option>
                ))}
            </Select>
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField id="tk-person" label="Person" error={errors.personId?.message}>
              <Select id="tk-person" {...register('personId')}>
                <option value="">— none —</option>
                {persons.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.firstName} {p.lastName}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField id="tk-employer" label="Employer">
              <Select id="tk-employer" {...register('employerId')}>
                <option value="">— none —</option>
                {employers.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.legalName}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          <FormErrorAlert error={formError} />
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <SubmitButton loading={isSubmitting}>Create task</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

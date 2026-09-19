'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
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
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toastResult } from '@/lib/toast-result';
import { updateTaskAction } from '@/modules/activities/actions';
import { type UpdateTaskInput, UpdateTaskSchema } from '@/modules/activities/schemas';
import type { TaskRow } from '@/modules/activities/service';
import type { UserListRow } from '@/modules/users/repository';

/**
 * Edit an existing task. Controlled dialog — parent owns open/close so the
 * same instance can back multiple row-menu triggers.
 *
 * Editing an archived task is refused server-side (BusinessRuleError).
 */
export function EditTaskDialog({
  task,
  users,
  onOpenChange,
}: {
  task: TaskRow | null;
  users: UserListRow[];
  onOpenChange: (next: boolean) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<UpdateTaskInput>({
    resolver: zodResolver(UpdateTaskSchema),
    defaultValues: emptyDefaults(),
  });

  useEffect(() => {
    if (task) {
      reset({
        taskId: task.id,
        title: task.title,
        description: task.description ?? '',
        dueAt: task.dueAt ? new Date(task.dueAt).toISOString().slice(0, 16) : '',
        assignedUserId: task.assignedUserId,
        priority: task.priority,
      });
    } else {
      reset(emptyDefaults());
    }
  }, [task, reset]);

  const onSubmit = handleSubmit(async (raw) => {
    const payload: UpdateTaskInput = {
      ...raw,
      dueAt: raw.dueAt ? new Date(raw.dueAt).toISOString() : '',
    };
    const r = await updateTaskAction(payload);
    if (toastResult(r, { success: 'Task updated' })) onOpenChange(false);
  });

  return (
    <Dialog open={task !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit task</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <input type="hidden" {...register('taskId')} />

          <FormField id="title" label="Title" error={errors.title?.message}>
            <Input id="title" {...register('title')} aria-invalid={Boolean(errors.title)} />
          </FormField>

          <FormField id="description" label="Description">
            <Textarea id="description" className="min-h-20" {...register('description')} />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField id="assignedUserId" label="Assignee">
              <Select id="assignedUserId" {...register('assignedUserId')}>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField id="priority" label="Priority">
              <Select id="priority" {...register('priority')}>
                <option value="LOW">Low</option>
                <option value="NORMAL">Normal</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </Select>
            </FormField>
          </div>

          <FormField id="dueAt" label="Due at">
            <Input id="dueAt" type="datetime-local" {...register('dueAt')} />
          </FormField>

          {Object.keys(errors).length > 0 && !errors.title && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
              <span>Fix the errors above and retry.</span>
            </div>
          )}

          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <SubmitButton loading={isSubmitting}>Save changes</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function emptyDefaults(): UpdateTaskInput {
  return {
    taskId: '00000000-0000-4000-8000-000000000000',
    title: '',
    description: '',
    dueAt: '',
    assignedUserId: '00000000-0000-4000-8000-000000000000',
    priority: 'NORMAL',
  };
}

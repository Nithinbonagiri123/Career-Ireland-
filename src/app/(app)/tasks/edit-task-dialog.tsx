'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useEffect } from 'react';
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
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

  // Reset the form whenever the target task changes.
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
    // If a datetime-local value is present, convert to ISO for the server.
    const payload: UpdateTaskInput = {
      ...raw,
      dueAt: raw.dueAt ? new Date(raw.dueAt).toISOString() : '',
    };
    const r = await updateTaskAction(payload);
    if (r.ok) {
      toast.success('Task updated');
      onOpenChange(false);
    } else {
      toast.error(r.error.message);
    }
  });

  return (
    <Dialog open={task !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit task</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <input type="hidden" {...register('taskId')} />

          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input id="title" {...register('title')} aria-invalid={Boolean(errors.title)} />
            {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <textarea
              id="description"
              className="min-h-20 w-full rounded-md border border-input bg-background p-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              {...register('description')}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="assignedUserId">Assignee</Label>
              <select
                id="assignedUserId"
                className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                {...register('assignedUserId')}
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="priority">Priority</Label>
              <select
                id="priority"
                className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                {...register('priority')}
              >
                <option value="LOW">Low</option>
                <option value="NORMAL">Normal</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dueAt">Due at</Label>
            <Input id="dueAt" type="datetime-local" {...register('dueAt')} />
          </div>

          {Object.keys(errors).length > 0 && !errors.title && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
              <span>Fix the errors above and retry.</span>
            </div>
          )}

          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
              Save changes
            </Button>
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

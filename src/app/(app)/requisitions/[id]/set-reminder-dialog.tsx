'use client';

import { Bell } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
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
import { createTaskAction } from '@/modules/activities/actions';

/**
 * Session 11 — requisition-scoped reminder. Creates a Task linked to
 * this requisition with a dueAt the operator picks. Mirrors the shape of
 * the Session-5 immigration-case reminder dialog but routes through the
 * generic createTaskAction because requisition reminders are just tasks.
 */
export function SetRequisitionReminderDialog({
  requisitionId,
  requisitionTitle,
  currentUserId,
}: {
  requisitionId: string;
  requisitionTitle: string;
  currentUserId: string;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState('');
  const [title, setTitle] = useState(`Follow up on "${requisitionTitle}"`);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const submit = () => {
    if (!date) {
      toast.error('Pick a reminder date');
      return;
    }
    const dueAt = new Date(`${date}T09:00:00.000Z`).toISOString();
    startTransition(async () => {
      const r = await createTaskAction({
        title,
        description: '',
        dueAt,
        assignedUserId: currentUserId,
        priority: 'NORMAL',
        personId: '',
        employerId: '',
        jobRequisitionId: requisitionId,
        serviceEngagementId: '',
        immigrationCaseId: '',
      });
      if (r.ok) {
        toast.success('Reminder set');
        setOpen(false);
        router.refresh();
      } else {
        toast.error(r.error.message);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" variant="outline">
            <Bell className="mr-1.5 size-4" /> Set reminder
          </Button>
        }
      />
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Set a reminder</DialogTitle>
          <DialogDescription>
            A task fires on this date so this requisition doesn't go quiet.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="rem-date">Reminder date</Label>
            <Input
              id="rem-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rem-title">Title</Label>
            <Input
              id="rem-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose
            render={
              <Button variant="ghost" disabled={pending}>
                Cancel
              </Button>
            }
          />
          <Button onClick={submit} disabled={pending}>
            {pending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

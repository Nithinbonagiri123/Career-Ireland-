'use client';

import { Bell, CheckCircle2, Lock, XCircle } from 'lucide-react';
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
import { setCaseReminderAction, updateCaseStatusAction } from '@/modules/immigration/actions';

/**
 * Session 5 — focused header buttons for the immigration case page.
 * Previously the user had to open Edit, change one field, and save.
 * Now each verb has a visible button that opens a tiny dialog or
 * fires a direct action.
 */

export function SetReminderDialog({
  caseId,
  currentReminderOn,
}: {
  caseId: string;
  currentReminderOn: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(currentReminderOn ?? '');
  const [pending, startTransition] = useTransition();

  const submit = () => {
    startTransition(async () => {
      const r = await setCaseReminderAction({ caseId, reminderOn: date });
      if (r.ok) {
        toast.success(date ? 'Reminder set' : 'Reminder cleared');
        setOpen(false);
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
            <Bell className="mr-1.5 size-4" />
            {currentReminderOn ? 'Change reminder' : 'Set reminder'}
          </Button>
        }
      />
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Set a reminder</DialogTitle>
          <DialogDescription>
            A follow-up task fires on this date so this case never goes quiet.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="reminderOn">Reminder date</Label>
          <Input
            id="reminderOn"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          {currentReminderOn && (
            <button
              type="button"
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
              onClick={() => setDate('')}
            >
              Clear reminder
            </button>
          )}
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

export function RecordDecisionButtons({ caseId }: { caseId: string }) {
  const [pending, startTransition] = useTransition();
  const change = (status: 'APPROVED' | 'REJECTED') => {
    const label = status === 'APPROVED' ? 'approved' : 'rejected';
    if (!window.confirm(`Mark this case as ${label}? Decision date will be set to today.`)) return;
    startTransition(async () => {
      const r = await updateCaseStatusAction({ caseId, status });
      if (r.ok) toast.success(`Marked ${label}`);
      else toast.error(r.error.message);
    });
  };
  return (
    <>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => change('APPROVED')}>
        <CheckCircle2 className="mr-1.5 size-4" /> Approved
      </Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => change('REJECTED')}>
        <XCircle className="mr-1.5 size-4" /> Rejected
      </Button>
    </>
  );
}

export function CloseCaseButton({ caseId }: { caseId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => {
        if (!window.confirm('Close this case? It will be hidden from the active list.')) return;
        startTransition(async () => {
          const r = await updateCaseStatusAction({ caseId, status: 'CLOSED' });
          if (r.ok) toast.success('Case closed');
          else toast.error(r.error.message);
        });
      }}
    >
      <Lock className="mr-1.5 size-4" />
      {pending ? 'Closing…' : 'Close case'}
    </Button>
  );
}

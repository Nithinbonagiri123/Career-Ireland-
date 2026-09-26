'use client';

import { UsersRound } from 'lucide-react';
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
import { Select } from '@/components/ui/select';
import { assignEntityAction } from '@/modules/assignments/actions';
import type { AssignableEntity } from '@/modules/assignments/service';

/**
 * Reusable "Reassign owner" dialog trigger. Works for every AssignableEntity
 * type — pass the entity + id + the current owner + the full staff list, plus
 * a display label so the dialog title reads naturally ("Reassign case for
 * Priya Sharma?", "Reassign requisition ABC-123?").
 *
 * Distinct from AssignToMeButton (which is a one-click claim/unclaim shortcut).
 * This flow collects a REASON so the audit trail carries the rationale — spec
 * §18 requires that reassignments be traceable.
 */

type StaffUser = { id: string; fullName: string; email: string };

type Props = {
  entity: AssignableEntity;
  id: string;
  /** Rendered in the dialog title after "Reassign …". */
  subjectLabel: string;
  currentAssignedUserId: string | null;
  currentAssignedName: string | null;
  staffUsers: StaffUser[];
  triggerVariant?: 'outline' | 'ghost' | 'default';
  triggerSize?: 'sm' | 'default';
};

export function ReassignButton({
  entity,
  id,
  subjectLabel,
  currentAssignedUserId,
  currentAssignedName,
  staffUsers,
  triggerVariant = 'outline',
  triggerSize = 'sm',
}: Props) {
  const [open, setOpen] = useState(false);
  const [nextUserId, setNextUserId] = useState<string>(currentAssignedUserId ?? '');
  const [reason, setReason] = useState('');
  const [pending, startTransition] = useTransition();

  const isSame = nextUserId === (currentAssignedUserId ?? '');
  const canSubmit = !isSame && reason.trim().length >= 3;

  const submit = () => {
    startTransition(async () => {
      const r = await assignEntityAction({
        entity,
        id,
        userId: nextUserId.length > 0 ? nextUserId : null,
        reason: reason.trim(),
      });
      if (r.ok) {
        toast.success('Owner reassigned');
        setOpen(false);
        setReason('');
      } else {
        toast.error(r.error.message);
      }
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setNextUserId(currentAssignedUserId ?? '');
          setReason('');
        }
      }}
    >
      <DialogTrigger
        render={
          <Button variant={triggerVariant} size={triggerSize}>
            <UsersRound className="mr-1.5 size-3.5" /> Reassign
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reassign {subjectLabel}</DialogTitle>
          <DialogDescription>
            {currentAssignedName ? (
              <>
                Currently owned by <span className="font-medium">{currentAssignedName}</span>.
                Handoff is written to the audit trail with the reason below.
              </>
            ) : (
              <>
                Currently unassigned. Assigning is written to the audit trail with the reason below.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="rb-owner">New owner</Label>
            <Select
              id="rb-owner"
              value={nextUserId}
              onChange={(e) => setNextUserId(e.currentTarget.value)}
            >
              <option value="">— unassigned —</option>
              {staffUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName} · {u.email}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rb-reason">Reason (audited)</Label>
            <Input
              id="rb-reason"
              value={reason}
              onChange={(e) => setReason(e.currentTarget.value)}
              placeholder="e.g. Original owner on annual leave"
              maxLength={500}
            />
            <p className="text-[11px] text-muted-foreground">
              At least 3 characters. Written to the audit log.
            </p>
          </div>
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" type="button" />}>Cancel</DialogClose>
          <Button onClick={submit} disabled={!canSubmit || pending}>
            Reassign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

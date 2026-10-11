'use client';

import { UserCheck, UserX } from 'lucide-react';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { assignEntityAction } from '@/modules/assignments/actions';
import type { AssignableEntity } from '@/modules/assignments/service';

/**
 * Session 33 — "Assign to me" and "Unassign" are both ownership
 * mutations, which under the new model only the business owner can
 * perform. Records auto-assign to their creator; staff don't need
 * (and shouldn't be able to) claim or release records. Non-owners
 * see nothing; the server action also gates on requireOwner().
 */
export function AssignToMeButton({
  entity,
  id,
  currentUserId,
  currentAssignedUserId,
  canReassign,
}: {
  entity: AssignableEntity;
  id: string;
  currentUserId: string;
  currentAssignedUserId: string | null;
  /** Session's `isOwner` flag. Non-owners never see this control. */
  canReassign: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const isMine = currentAssignedUserId === currentUserId;

  const click = () => {
    startTransition(async () => {
      const r = await assignEntityAction({
        entity,
        id,
        userId: isMine ? null : currentUserId,
      });
      if (r.ok) toast.success(isMine ? 'Unassigned' : 'Assigned to you');
      else toast.error(r.error.message);
    });
  };

  if (!canReassign) return null;

  return (
    <Button variant="outline" size="sm" disabled={pending} onClick={click}>
      {isMine ? (
        <>
          <UserX className="mr-1.5 size-3.5" /> Unassign
        </>
      ) : (
        <>
          <UserCheck className="mr-1.5 size-3.5" /> Assign to me
        </>
      )}
    </Button>
  );
}

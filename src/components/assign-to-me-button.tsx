'use client';

import { UserCheck, UserX } from 'lucide-react';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { assignEntityAction } from '@/modules/assignments/actions';
import type { AssignableEntity } from '@/modules/assignments/service';

/**
 * Small button for the detail-page header: quick claim ("Assign to me") or unassign.
 * `currentAssignedUserId` and `currentUserId` are passed by the server component so
 * we can render the right state without a fetch.
 */
export function AssignToMeButton({
  entity,
  id,
  currentUserId,
  currentAssignedUserId,
}: {
  entity: AssignableEntity;
  id: string;
  currentUserId: string;
  currentAssignedUserId: string | null;
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

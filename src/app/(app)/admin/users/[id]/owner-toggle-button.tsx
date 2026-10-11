'use client';

import { ShieldCheck, ShieldOff } from 'lucide-react';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { setUserOwnerAction } from '@/modules/users/actions';

/**
 * Session 33 — grant/revoke the business-owner flag on another user.
 * The server action enforces owner-only + the "last owner can't be
 * demoted" rule; this client component just drives the one-click
 * confirmation and toast feedback.
 */
export function OwnerToggleButton({
  userId,
  userName,
  currentIsOwner,
}: {
  userId: string;
  userName: string;
  currentIsOwner: boolean;
}) {
  const [pending, startTransition] = useTransition();

  const click = () => {
    const next = !currentIsOwner;
    const confirmed = window.confirm(
      next
        ? `Grant business-owner status to ${userName}? They will be able to bypass every permission check and reassign any record.`
        : `Revoke business-owner status from ${userName}? Their current session will end immediately.`,
    );
    if (!confirmed) return;
    startTransition(async () => {
      const r = await setUserOwnerAction({ userId, isOwner: next });
      if (r.ok) {
        toast.success(
          next ? `${userName} is now a business owner` : `${userName} is no longer an owner`,
        );
      } else {
        toast.error(r.error.message);
      }
    });
  };

  return (
    <Button
      size="sm"
      variant={currentIsOwner ? 'outline' : 'default'}
      onClick={click}
      disabled={pending}
    >
      {currentIsOwner ? (
        <>
          <ShieldOff className="mr-1.5 size-3.5" />
          Revoke owner
        </>
      ) : (
        <>
          <ShieldCheck className="mr-1.5 size-3.5" />
          Grant owner
        </>
      )}
    </Button>
  );
}

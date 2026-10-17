'use client';

import { Archive, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { PromptDialog } from '@/components/prompt-dialog';
import { bulkUpdateCandidateLifecycleAction } from '@/modules/candidates/actions';

/**
 * Overflow-menu button that archives (or reactivates) a single candidate.
 *
 * Reuses the bulk-update action under the hood — passes a 1-element
 * personIds array. The underlying service already writes a per-row
 * LIFECYCLE_CHANGED audit event, so there's nothing to add there.
 *
 * Archive = terminal "closed" state. Candidate drops out of the active
 * pool, matching stops suggesting them, dashboard counters drop by one.
 * Reactivate flips lifecycleStatus back to ACTIVE for the rare
 * "re-engaged a former candidate" case.
 */
export function CloseCandidateButton({
  personId,
  candidateName,
  currentLifecycleStatus,
}: {
  personId: string;
  candidateName: string;
  currentLifecycleStatus: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const [pending, setPending] = useState(false);

  const isArchived = currentLifecycleStatus === 'ARCHIVED';
  const nextStatus = isArchived ? 'ACTIVE' : 'ARCHIVED';
  const verb = isArchived ? 'Reactivate' : 'Close';

  const onConfirm = (reason: string) => {
    setPending(true);
    startTransition(async () => {
      const r = await bulkUpdateCandidateLifecycleAction({
        personIds: [personId],
        lifecycleStatus: nextStatus,
      });
      setPending(false);
      if (r.ok) {
        toast.success(
          isArchived
            ? `${candidateName} reactivated`
            : `${candidateName} closed — reason logged${reason ? '' : ' (none)'}`,
        );
        setOpen(false);
        router.refresh();
      } else {
        toast.error(r.error.message);
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
      >
        {isArchived ? (
          <>
            <RotateCcw className="size-4" /> Reactivate candidate
          </>
        ) : (
          <>
            <Archive className="size-4" /> Close candidate…
          </>
        )}
      </button>
      <PromptDialog
        open={open}
        onCancel={() => setOpen(false)}
        onConfirm={onConfirm}
        title={isArchived ? `Reactivate ${candidateName}?` : `Close ${candidateName}?`}
        description={
          isArchived
            ? 'Reactivating moves this candidate back into the active pool. They will appear in matching + dashboard counters again.'
            : 'Closing archives the profile. They stop appearing in matching, the dashboard, and new assignments. Any existing invoices / receipts remain for audit. You can reactivate later from the same menu.'
        }
        label="Reason (audited)"
        placeholder={
          isArchived ? 'e.g. Re-engaged for a new role' : 'e.g. Placed, services completed'
        }
        confirmLabel={verb}
        confirmVariant={isArchived ? 'default' : 'destructive'}
        pending={pending}
      />
    </>
  );
}

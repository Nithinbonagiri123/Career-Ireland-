'use client';

import { Lock, Sparkles } from 'lucide-react';
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
import { runAssistedMatchingAction } from '@/modules/matching/actions';
import { matchingRunSummary } from '@/modules/matching/labels';
import { DEFAULT_MIN_SCORE } from '@/modules/matching/schemas';
import { updateRequisitionStatusAction } from '@/modules/requisitions/actions';

export function RunMatchingButton({
  requisitionId,
  criteriaWarning,
}: {
  requisitionId: string;
  /** R5 — set when this job's criteria cannot reach the default minimum score. */
  criteriaWarning?: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      title={
        criteriaWarning ??
        `Adds new candidates scoring at least ${DEFAULT_MIN_SCORE} of 100; existing matches are refreshed`
      }
      onClick={() =>
        startTransition(async () => {
          const r = await runAssistedMatchingAction(requisitionId);
          if (r.ok) {
            toast.success(matchingRunSummary(r.data));
            // Suggest, never apply, a lower minimum for jobs that cannot reach it.
            if (criteriaWarning) {
              toast.warning(criteriaWarning, {
                duration: 12_000,
                action: {
                  label: 'Lower it on Matching',
                  onClick: () => router.push(`/matching?job=${requisitionId}`),
                },
              });
            }
            router.refresh();
          } else toast.error(r.error.message);
        })
      }
    >
      <Sparkles className="mr-1.5 size-4" />
      {pending ? 'Scoring…' : 'Run assisted matching'}
    </Button>
  );
}

/**
 * Visible "close requisition" button. Audit Session 5 — the old flow
 * (Edit → change status → save) hid a primary workflow action behind
 * the edit dialog. This surfaces it one click away, with a confirm so
 * nobody closes a requisition by muscle-memory.
 */
export function CloseRequisitionButton({
  requisitionId,
  defaultOpen,
  hideTrigger,
}: {
  requisitionId: string;
  /** R0 — the "Close requisition" next-action deep-links here with
   *  ?close=1 instead of linking back to the page it was already on.
   *  The overflow menu's copy of this button is unmounted until the
   *  menu opens, so the page renders a second, trigger-less instance
   *  (hideTrigger) when the deep link asks for the dialog. */
  defaultOpen?: boolean;
  hideTrigger?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!hideTrigger && (
        <DialogTrigger
          render={
            <Button size="sm" variant="outline" disabled={pending}>
              <Lock className="mr-1.5 size-4" />
              Close requisition
            </Button>
          }
        />
      )}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Close this requisition?</DialogTitle>
          <DialogDescription>
            Candidates in the pipeline stay recorded, placements and billing history are kept, and
            any outstanding invoices remain collectible. A closed requisition no longer accepts new
            placements.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" type="button" disabled={pending} />}>
            Cancel
          </DialogClose>
          <Button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await updateRequisitionStatusAction({ requisitionId, status: 'CLOSED' });
                if (r.ok) {
                  toast.success('Requisition closed');
                  setOpen(false);
                  router.refresh();
                } else toast.error(r.error.message);
              })
            }
          >
            {pending ? 'Closing…' : 'Close requisition'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

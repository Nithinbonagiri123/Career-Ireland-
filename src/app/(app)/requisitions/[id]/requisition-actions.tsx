'use client';

import { Lock, Sparkles } from 'lucide-react';
import { useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { runAssistedMatchingAction } from '@/modules/matching/actions';
import { updateRequisitionStatusAction } from '@/modules/requisitions/actions';

export function RunMatchingButton({ requisitionId }: { requisitionId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const r = await runAssistedMatchingAction(requisitionId);
          if (r.ok) toast.success(`Matching complete — ${r.data.upserted} candidates scored`);
          else toast.error(r.error.message);
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
export function CloseRequisitionButton({ requisitionId }: { requisitionId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => {
        if (!window.confirm('Close this requisition? Candidates in-pipeline will stay recorded.'))
          return;
        startTransition(async () => {
          const r = await updateRequisitionStatusAction({ requisitionId, status: 'CLOSED' });
          if (r.ok) toast.success('Requisition closed');
          else toast.error(r.error.message);
        });
      }}
    >
      <Lock className="mr-1.5 size-4" />
      {pending ? 'Closing…' : 'Close requisition'}
    </Button>
  );
}

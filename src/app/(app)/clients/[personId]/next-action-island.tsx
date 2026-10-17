'use client';

import { useState } from 'react';
import type { ClientDialog, ClientNextAction } from '@/modules/clients/next-action';
import { ActivateCandidateDialog } from './activate-candidate-dialog';
import { ClientPrimaryAction } from './primary-action';

/**
 * Wires the primary-action button to the inline dialogs. The only true
 * inline dialog today is `activate-candidate`; the others resolve as link
 * actions and route to the pro-forma detail page where their dialogs
 * already live. Reserved for Phase 6B+1: embedding create-quote,
 * record-payment and mark-accepted directly in the workspace.
 */
export function ClientNextActionIsland({
  action,
  activationLeadId,
}: {
  action: ClientNextAction;
  /** Lead to activate from when the dialog opens. Null if there is no
   *  CS lead available — the dialog won't be reachable in that case. */
  activationLeadId: string | null;
}) {
  const [openDialog, setOpenDialog] = useState<ClientDialog | null>(null);
  return (
    <>
      <ClientPrimaryAction action={action} onOpenDialog={(d) => setOpenDialog(d)} />
      <ActivateCandidateDialog
        leadId={activationLeadId}
        open={openDialog === 'activate-candidate'}
        onOpenChange={(next) => setOpenDialog(next ? 'activate-candidate' : null)}
      />
    </>
  );
}

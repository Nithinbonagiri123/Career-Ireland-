'use server';

import { revalidatePath } from 'next/cache';
import { requireInternalStaff } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { ValidationError } from '@/lib/errors';
import { toActionResult } from '@/lib/result';
import { type ActivateResult, activateCandidateInTx } from './activation-service';

/**
 * Operator-initiated candidate activation. Thin wrapper around
 * `activateCandidateInTx` (see activation-service.ts) that supplies
 * the session + transaction. Preserved as a server action so the
 * operator still has an explicit "Activate candidate" affordance for
 * the rare path where no pro-forma payment triggers activation
 * automatically (e.g. a manual override, a legacy lead with no
 * money record, finance-decided waiver).
 *
 * The common path — "accepted pro forma → full verified payment →
 * official invoice issued → candidate activated" — now happens inside
 * `verifyPaymentForProForma` (modules/proformas/payments.ts) so the
 * operator never has to click Activate separately. See Stage 6F.
 */
export async function activateCandidateAction(input: {
  leadId: string;
}): Promise<ReturnType<typeof toActionResult<ActivateResult>>> {
  const result = await toActionResult<ActivateResult>(() => activateCandidate(input));
  if (result.ok) {
    revalidatePath('/leads');
    revalidatePath('/candidates');
    revalidatePath(`/clients/${result.data.personId}`);
  }
  return result;
}

async function activateCandidate(input: { leadId: string }): Promise<ActivateResult> {
  const session = await requireInternalStaff();
  if (!input.leadId || input.leadId.length < 10) {
    throw new ValidationError('leadId is required.', { leadId: 'Required.' });
  }

  return db.transaction((tx) =>
    activateCandidateInTx(tx, {
      leadId: input.leadId,
      actorUserId: session.user.id,
      via: 'activate_candidate',
    }),
  );
}

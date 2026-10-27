'use server';

import { sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { hasFinanceAuthority } from '@/lib/auth/finance-policy-rules';
import { requireInternalStaff } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { BusinessRuleError, ValidationError } from '@/lib/errors';
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

  return db.transaction(async (tx) => {
    // Phase 1 — manual activation opens the candidate's service, so the
    // server (not only the UI) requires settled money first: a VERIFIED
    // payment or a complimentary invoice for the lead's person, unless
    // the caller holds finance authority.
    if (!hasFinanceAuthority(session.user, 'VERIFY')) {
      const [row] = await tx.execute<{ ok: boolean }>(sql`
        SELECT EXISTS(
          SELECT 1 FROM leads l
          JOIN service_engagements e ON e.payer_person_id = l.person_id
          LEFT JOIN payments p ON p.service_engagement_id = e.id
            AND p.status IN ('VERIFIED','PARTIALLY_REFUNDED')
          LEFT JOIN invoices i ON i.service_engagement_id = e.id
            AND i.settlement_kind = 'COMPLIMENTARY' AND i.status <> 'VOIDED'
          WHERE l.id = ${input.leadId} AND (p.id IS NOT NULL OR i.id IS NOT NULL)
        ) AS ok
      `);
      if (!row?.ok) {
        throw new BusinessRuleError(
          'ACTIVATION_REQUIRES_PAYMENT',
          'Activate a candidate once their payment is verified. Ask Finance to verify the payment first.',
        );
      }
    }
    return activateCandidateInTx(tx, {
      leadId: input.leadId,
      actorUserId: session.user.id,
      via: 'activate_candidate',
    });
  });
}

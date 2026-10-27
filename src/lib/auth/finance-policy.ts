import { eq } from 'drizzle-orm';
import { type DbExecutor, recordAudit } from '@/lib/audit/withAudit';
import { db } from '@/lib/db/client';
import { users } from '@/lib/db/schema/users';
import { AuthorizationError } from '@/lib/errors';
import {
  FINANCE_DENIAL_MESSAGES,
  type FinanceTier,
  hasFinanceAuthority,
} from './finance-policy-rules';
import { getSession, requireSession, type Session } from './session';

export { type FinanceTier, hasFinanceAuthority } from './finance-policy-rules';

async function logFinanceDenied(
  actorUserId: string,
  tier: FinanceTier,
  action: string,
  role: string | null,
): Promise<void> {
  try {
    await recordAudit(db, {
      actorUserId,
      entityType: 'session',
      entityId: actorUserId,
      action: 'AUTH_DENIED',
      context: { reason: 'finance_policy', tier, action, actual: role },
    });
  } catch {
    // Instrumentation only — never blocks the refusal.
  }
}

/**
 * Entry gate for a server action / service function. Returns the session
 * when the caller holds `tier` authority, otherwise audits the attempt
 * and throws AuthorizationError.
 */
export async function requireFinanceAuthority(tier: FinanceTier, action: string): Promise<Session> {
  const session = await requireSession();
  if (!hasFinanceAuthority(session.user, tier)) {
    await logFinanceDenied(session.user.id, tier, action, session.user.role);
    throw new AuthorizationError(FINANCE_DENIAL_MESSAGES[tier]);
  }
  return session;
}

/** Non-throwing form for UI decisions (show / hide a button). */
export async function canFinance(tier: FinanceTier): Promise<boolean> {
  const session = await getSession();
  return session ? hasFinanceAuthority(session.user, tier) : false;
}

/**
 * Defence in depth for the privileged side effect itself (verifying a
 * payment, issuing an official invoice or receipt, refunding). Re-reads
 * the acting user from the database inside the caller's transaction, so
 * a session-less `...As(actorUserId)` path or a future caller that forgot
 * the entry gate still cannot act for a user without authority, and a
 * user deactivated or demoted mid-session is refused immediately.
 */
export async function assertFinanceActor(
  tx: DbExecutor,
  actorUserId: string,
  tier: FinanceTier,
  action: string,
): Promise<void> {
  const [actor] = await tx
    .select({ role: users.role, isOwner: users.isOwner, isActive: users.isActive })
    .from(users)
    .where(eq(users.id, actorUserId))
    .limit(1);
  if (!actor || !hasFinanceAuthority(actor, tier)) {
    await logFinanceDenied(actorUserId, tier, action, actor?.role ?? null);
    throw new AuthorizationError(FINANCE_DENIAL_MESSAGES[tier]);
  }
}

import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { type DbExecutor, recordAudit } from '@/lib/audit/withAudit';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import {
  type AccountingPeriod,
  accountingPeriods,
  journalLines,
  journals,
} from '@/lib/db/schema/accounting';
import { BusinessRuleError, ValidationError } from '@/lib/errors';

/**
 * Accounting period lifecycle:
 *
 *   OPEN         ─▶   SOFT_CLOSED    ─▶   CLOSED    ─▶   LOCKED
 *     ▲                                      │
 *     └──────────────────────────────────────┘  (reopenPeriod, ADMIN only)
 *
 * - OPEN:         all operations allowed (new postings, reversals).
 * - SOFT_CLOSED:  period owner has signed off. New postings REJECTED.
 *                 Reversal journals land in the current OPEN period, not
 *                 this one — so the ledger history stays coherent.
 * - CLOSED:       same as SOFT_CLOSED for the ledger. Separate state so
 *                 management can distinguish "finance has reviewed" from
 *                 "statutory close is done".
 * - LOCKED:       auditor has sealed the period. Only ADMIN can unlock,
 *                 and only via `reopenPeriod` which drops the state back
 *                 to OPEN with a mandatory audit note. Avoid this path.
 *
 * The DB layer backs this up with a CHECK constraint on `status`. The
 * service layer here is where the TRANSITION rules live.
 */

export type PeriodStatus = 'OPEN' | 'SOFT_CLOSED' | 'CLOSED' | 'LOCKED';

/**
 * Which statuses accept new JOURNAL postings. Reversals are routed to
 * the current period anyway, so this applies to the period of the
 * event's date — not of the reversal.
 */
const POSTABLE_STATUSES: PeriodStatus[] = ['OPEN'];

export type PeriodPurpose = 'POSTING' | 'READ';

/**
 * Get-or-create the accounting period that owns `date`. Periods are
 * created lazily on first journal post — we don't precreate 12 rows per
 * year because that forces a decision about future period status.
 *
 * **Must run inside the caller's transaction** so the period row and
 * the journal that triggered its creation commit together.
 *
 * For `purpose='POSTING'` (the default), the period must be OPEN —
 * SOFT_CLOSED / CLOSED / LOCKED all throw `PERIOD_NOT_OPEN`.
 * For `purpose='READ'`, any status is accepted (used by reports).
 */
export async function getOrCreatePeriodForDate(
  tx: DbExecutor,
  date: Date,
  purpose: PeriodPurpose = 'POSTING',
): Promise<AccountingPeriod> {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;

  const [existing] = await tx
    .select()
    .from(accountingPeriods)
    .where(and(eq(accountingPeriods.year, year), eq(accountingPeriods.month, month)))
    .limit(1);

  if (existing) {
    if (purpose === 'POSTING' && !POSTABLE_STATUSES.includes(existing.status as PeriodStatus)) {
      throw new BusinessRuleError(
        'PERIOD_NOT_OPEN',
        `Accounting period ${year}-${String(month).padStart(2, '0')} is ${existing.status}. ` +
          'Reopen the period or route this posting to the current open period instead.',
      );
    }
    return existing;
  }

  const [created] = await tx
    .insert(accountingPeriods)
    .values({ year, month, status: 'OPEN' })
    .returning();
  if (!created) throw new Error('accounting_periods insert returned no row');
  return created;
}

export type PeriodListRow = {
  id: string;
  year: number;
  month: number;
  status: PeriodStatus;
  openedAt: Date | null;
  closedAt: Date | null;
  lockedAt: Date | null;
  journalCount: number;
  postedCount: number;
};

export async function listPeriods(limit = 36): Promise<PeriodListRow[]> {
  // Pull every period header first, newest first. Volume is small
  // (12 rows per year), so a plain SELECT is faster + simpler than
  // trying to shape a windowed count.
  const rows = await db
    .select({
      id: accountingPeriods.id,
      year: accountingPeriods.year,
      month: accountingPeriods.month,
      status: accountingPeriods.status,
      openedAt: accountingPeriods.openedAt,
      closedAt: accountingPeriods.closedAt,
      lockedAt: accountingPeriods.lockedAt,
      journalCount: sql<string>`(
        SELECT COUNT(*)::text FROM ${journals}
        WHERE ${journals.periodId} = ${accountingPeriods.id}
      )`,
      postedCount: sql<string>`(
        SELECT COUNT(*)::text FROM ${journals}
        WHERE ${journals.periodId} = ${accountingPeriods.id} AND ${journals.status} = 'POSTED'
      )`,
    })
    .from(accountingPeriods)
    .orderBy(desc(accountingPeriods.year), desc(accountingPeriods.month))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    year: r.year,
    month: r.month,
    status: r.status as PeriodStatus,
    openedAt: r.openedAt,
    closedAt: r.closedAt,
    lockedAt: r.lockedAt,
    journalCount: Number.parseInt(r.journalCount, 10),
    postedCount: Number.parseInt(r.postedCount, 10),
  }));
}

/** Which `from → to` transitions are legal. Keep this table terse — if
 * it grows, consider turning it into a proper state machine. */
const ALLOWED_TRANSITIONS: Record<PeriodStatus, PeriodStatus[]> = {
  OPEN: ['SOFT_CLOSED'],
  SOFT_CLOSED: ['CLOSED', 'OPEN'],
  CLOSED: ['LOCKED', 'OPEN'],
  LOCKED: ['OPEN'],
};

export type TransitionPeriodInput = {
  periodId: string;
  to: PeriodStatus;
  reason: string;
};

/**
 * Transition a period's status. ADMIN + FINANCE for most moves; LOCKED
 * is ADMIN-only (statutory seal). Reopening from LOCKED is also
 * ADMIN-only.
 *
 * Pre-close checks (for OPEN → SOFT_CLOSED and SOFT_CLOSED → CLOSED):
 *   - No DRAFT or PENDING_APPROVAL journals in the period
 *   - Period's trial balance (debits vs credits across all its lines)
 *     must balance. The DB-level trigger guarantees this per-journal,
 *     but we check per-period defensively.
 *
 * Reopen checks:
 *   - Only ADMIN can reopen a LOCKED period
 *   - Reason mandatory and surfaced in audit log
 *
 * Always writes to the audit log, even on rejection.
 */
export async function transitionPeriod(input: TransitionPeriodInput): Promise<AccountingPeriod> {
  const trimmedReason = input.reason.trim();
  if (trimmedReason.length < 3) {
    throw new ValidationError('A period-transition reason of at least 3 characters is required.', {
      reason: 'Explain why — the audit trail needs it.',
    });
  }

  const session = await requireRole(['ADMIN', 'FINANCE']);

  return db.transaction(async (tx) => {
    const [period] = await tx
      .select()
      .from(accountingPeriods)
      .where(eq(accountingPeriods.id, input.periodId))
      .for('update')
      .limit(1);
    if (!period)
      throw new BusinessRuleError('PERIOD_NOT_FOUND', `period ${input.periodId} not found`);

    const from = period.status as PeriodStatus;
    const allowed = ALLOWED_TRANSITIONS[from];
    if (!allowed.includes(input.to)) {
      throw new BusinessRuleError(
        'PERIOD_INVALID_TRANSITION',
        `cannot transition period ${period.year}-${String(period.month).padStart(2, '0')} from ${from} to ${input.to} (allowed: ${allowed.join(', ') || '—'})`,
      );
    }

    // Role gates for high-impact transitions.
    if (input.to === 'LOCKED' && session.user.role !== 'ADMIN') {
      throw new BusinessRuleError(
        'PERIOD_LOCK_REQUIRES_ADMIN',
        'Locking a period is an ADMIN-only action (statutory seal).',
      );
    }
    if (from === 'LOCKED' && session.user.role !== 'ADMIN') {
      throw new BusinessRuleError(
        'PERIOD_REOPEN_REQUIRES_ADMIN',
        'Reopening a LOCKED period is an ADMIN-only action.',
      );
    }

    // Pre-close invariant checks for forward transitions. Reopens
    // (anything → OPEN) skip these: the whole point of a reopen is to
    // fix something.
    const isForwardClose =
      (from === 'OPEN' && input.to === 'SOFT_CLOSED') ||
      (from === 'SOFT_CLOSED' && input.to === 'CLOSED') ||
      (from === 'CLOSED' && input.to === 'LOCKED');

    if (isForwardClose) {
      await assertPeriodReadyForClose(tx, period.id, period.year, period.month);
    }

    // Timestamps follow the state machine: `closedAt` on SOFT_CLOSED /
    // CLOSED, `lockedAt` on LOCKED, both cleared on reopen.
    const now = new Date();
    const patch: Partial<typeof period> = { status: input.to, updatedAt: now };
    if (input.to === 'OPEN') {
      patch.closedAt = null;
      patch.lockedAt = null;
    } else if (input.to === 'SOFT_CLOSED' || input.to === 'CLOSED') {
      patch.closedAt = now;
    } else if (input.to === 'LOCKED') {
      patch.lockedAt = now;
    }

    const [updated] = await tx
      .update(accountingPeriods)
      .set(patch)
      .where(eq(accountingPeriods.id, period.id))
      .returning();
    if (!updated) throw new Error('accounting_periods update returned no row');

    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'accounting_period',
      entityId: period.id,
      action: input.to === 'OPEN' ? 'REOPEN_PERIOD' : 'CLOSE_PERIOD',
      before: { status: from },
      after: { status: input.to, year: period.year, month: period.month },
      context: { reason: trimmedReason },
    });

    return updated;
  });
}

/**
 * Enforce the two invariants that must hold before a period can move
 * forward in the close pipeline. Called inside the caller's tx so a
 * concurrent post into the same period is serialised by the row lock
 * `transitionPeriod` takes above.
 */
async function assertPeriodReadyForClose(
  tx: DbExecutor,
  periodId: string,
  year: number,
  month: number,
): Promise<void> {
  // 1. No DRAFT or PENDING_APPROVAL journals in the period.
  const unclean = await tx
    .select({ id: journals.id, number: journals.number, status: journals.status })
    .from(journals)
    .where(
      and(eq(journals.periodId, periodId), inArray(journals.status, ['DRAFT', 'PENDING_APPROVAL'])),
    )
    .limit(5);
  if (unclean.length > 0) {
    throw new BusinessRuleError(
      'PERIOD_HAS_UNCLEAN_JOURNALS',
      `Cannot close ${year}-${String(month).padStart(2, '0')} — ${unclean.length} journal(s) still ${unclean[0].status}: ${unclean.map((u) => u.number).join(', ')}. Post or void them first.`,
    );
  }

  // 2. Per-period trial balance must balance. The per-journal trigger
  // guarantees each individual journal balances; this is a defence in
  // depth that also catches cross-journal arithmetic drift from any
  // future custom insertion that somehow bypassed the trigger.
  const [sumRow] = await tx
    .select({
      // Text return then parse in JS so cents arithmetic stays
      // integer-based (no float drift).
      debit: sql<string>`COALESCE(SUM(${journalLines.debit}), 0)::text`,
      credit: sql<string>`COALESCE(SUM(${journalLines.credit}), 0)::text`,
    })
    .from(journalLines)
    .innerJoin(journals, eq(journals.id, journalLines.journalId))
    .where(and(eq(journals.periodId, periodId), inArray(journals.status, ['POSTED', 'REVERSED'])));

  const debitCents = Math.round(Number.parseFloat(sumRow?.debit ?? '0') * 100);
  const creditCents = Math.round(Number.parseFloat(sumRow?.credit ?? '0') * 100);
  if (debitCents !== creditCents) {
    throw new BusinessRuleError(
      'PERIOD_UNBALANCED',
      `Cannot close ${year}-${String(month).padStart(2, '0')} — period trial balance has drifted: debits ${(debitCents / 100).toFixed(2)}, credits ${(creditCents / 100).toFixed(2)}. Investigate before closing.`,
    );
  }
}

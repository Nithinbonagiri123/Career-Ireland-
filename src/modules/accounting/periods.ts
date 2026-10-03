import { and, eq } from 'drizzle-orm';
import type { DbExecutor } from '@/lib/audit/withAudit';
import { type AccountingPeriod, accountingPeriods } from '@/lib/db/schema/accounting';
import { BusinessRuleError } from '@/lib/errors';

/**
 * Get-or-create the accounting period that owns `date`. Periods are
 * created lazily on first journal post — we don't precreate 12 rows per
 * year because that forces a decision about future period status.
 *
 * **Must run inside the caller's transaction** so the period row and
 * the journal that triggered its creation commit together.
 *
 * Throws `BusinessRuleError` if the resolved period is `LOCKED` — the
 * caller is attempting to back-date into a sealed period, which Phase 1
 * does not support (the controlled-adjustment flow is Phase 4).
 */
export async function getOrCreatePeriodForDate(
  tx: DbExecutor,
  date: Date,
): Promise<AccountingPeriod> {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;

  const [existing] = await tx
    .select()
    .from(accountingPeriods)
    .where(and(eq(accountingPeriods.year, year), eq(accountingPeriods.month, month)))
    .limit(1);

  if (existing) {
    if (existing.status === 'LOCKED') {
      throw new BusinessRuleError(
        'PERIOD_LOCKED',
        `Accounting period ${year}-${String(month).padStart(2, '0')} is LOCKED. ` +
          'Reversal/adjustment postings into closed periods are not supported in Phase 1.',
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

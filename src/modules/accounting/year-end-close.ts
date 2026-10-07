import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { recordAudit } from '@/lib/audit/withAudit';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import {
  businessDivisions,
  chartOfAccounts,
  type Journal,
  journalLines,
  journals,
} from '@/lib/db/schema/accounting';
import { documentSequences } from '@/lib/db/schema/billing';
import { BusinessRuleError, ValidationError } from '@/lib/errors';
import { getOrCreatePeriodForDate } from './periods';

/**
 * Year-end close journal.
 *
 * On 31 December of each year, "close" the income statement by zeroing
 * REVENUE / COST_OF_SALES / EXPENSE / OTHER_INCOME / OTHER_EXPENSE
 * accounts into Retained Earnings. After this journal posts, the
 * Balance Sheet's synthetic "Current year profit" line drops to zero
 * because the P&L accounts no longer carry a balance — their value has
 * moved into 3100 Retained Earnings as real equity.
 *
 * Mechanics for a year's net profit of P (positive = profit):
 *   For each REVENUE / OTHER_INCOME account with credit balance C:
 *     DR account  C
 *       CR 3100 Retained Earnings  C
 *   For each COST_OF_SALES / EXPENSE / OTHER_EXPENSE account with
 *   debit balance D:
 *     DR 3100 Retained Earnings  D
 *       CR account  D
 * Net Retained Earnings movement: +P (credit when profit, debit when loss).
 *
 * The journal is one atomic post. The DB-level balance trigger
 * guarantees debits equal credits — any P&L arithmetic drift would
 * surface here rather than silently landing in the ledger.
 *
 * ADMIN only. Idempotent per calendar year via a check against
 * existing close journals with the same `source_type='YEAR_END_CLOSE'`
 * and matching year in the description.
 */

export const PostYearEndCloseSchema = z.object({
  year: z.number().int().min(2020).max(2100),
});
export type PostYearEndCloseInput = z.infer<typeof PostYearEndCloseSchema>;

export async function postYearEndClose(input: PostYearEndCloseInput): Promise<Journal> {
  const session = await requireRole(['ADMIN']);
  const parsed = PostYearEndCloseSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError('Invalid year-end close input', {
      year: 'Must be between 2020 and 2100',
    });
  }
  const year = parsed.data.year;

  return db.transaction(async (tx) => {
    // Guard: already closed?
    const [existing] = await tx
      .select({ id: journals.id, number: journals.number })
      .from(journals)
      .where(
        and(
          eq(journals.sourceType, 'YEAR_END_CLOSE'),
          sql`${journals.description} LIKE ${`Year-end close ${year}%`}`,
        ),
      )
      .limit(1);
    if (existing) {
      throw new BusinessRuleError(
        'YEAR_ALREADY_CLOSED',
        `${year} already closed by journal ${existing.number}`,
      );
    }

    // Resolve Retained Earnings — mandatory on the chart.
    const [retainedEarnings] = await tx
      .select({ id: chartOfAccounts.id, allowPosting: chartOfAccounts.allowPosting })
      .from(chartOfAccounts)
      .where(eq(chartOfAccounts.code, '3100'))
      .limit(1);
    if (!retainedEarnings) {
      throw new BusinessRuleError(
        'RETAINED_EARNINGS_MISSING',
        'Account 3100 Retained Earnings is required to run year-end close. Seed the chart first.',
      );
    }
    if (!retainedEarnings.allowPosting) {
      throw new BusinessRuleError(
        'RETAINED_EARNINGS_NOT_POSTABLE',
        'Account 3100 Retained Earnings is a parent/summary account; make it postable or pick a different RE account.',
      );
    }

    // Aggregate P&L balances for the year.
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;
    const balances = await tx
      .select({
        accountId: chartOfAccounts.id,
        accountCode: chartOfAccounts.code,
        accountType: chartOfAccounts.type,
        debit: sql<string>`COALESCE(SUM(${journalLines.debit}), 0)::text`,
        credit: sql<string>`COALESCE(SUM(${journalLines.credit}), 0)::text`,
      })
      .from(journalLines)
      .innerJoin(chartOfAccounts, eq(chartOfAccounts.id, journalLines.accountId))
      .innerJoin(journals, eq(journals.id, journalLines.journalId))
      .where(
        and(
          inArray(journals.status, ['POSTED', 'REVERSED']),
          sql`${journals.postingDate} BETWEEN ${yearStart} AND ${yearEnd}`,
          inArray(chartOfAccounts.type, [
            'REVENUE',
            'OTHER_INCOME',
            'COST_OF_SALES',
            'EXPENSE',
            'OTHER_EXPENSE',
          ]),
        ),
      )
      .groupBy(chartOfAccounts.id, chartOfAccounts.code, chartOfAccounts.type);

    if (balances.length === 0) {
      throw new BusinessRuleError(
        'NOTHING_TO_CLOSE',
        `No posted P&L activity in ${year} — nothing to close.`,
      );
    }

    const period = await getOrCreatePeriodForDate(tx, new Date(yearEnd));

    // Allocate a JRN number.
    const [seqRow] = await tx
      .insert(documentSequences)
      .values({ prefix: 'JRN', year, currentValue: 1 })
      .onConflictDoUpdate({
        target: [documentSequences.prefix, documentSequences.year],
        set: {
          currentValue: sql`${documentSequences.currentValue} + 1`,
          updatedAt: sql`NOW()`,
        },
      })
      .returning({ currentValue: documentSequences.currentValue });
    if (!seqRow) throw new Error('document_sequences upsert returned no row');
    const journalNumber = `JRN-${year}-${String(seqRow.currentValue).padStart(6, '0')}`;

    const [header] = await tx
      .insert(journals)
      .values({
        number: journalNumber,
        journalDate: yearEnd,
        postingDate: new Date().toISOString().slice(0, 10),
        periodId: period.id,
        transactionCurrency: 'EUR',
        functionalCurrency: 'EUR',
        exchangeRate: '1',
        description: `Year-end close ${year} — move P&L balances to Retained Earnings`,
        sourceType: 'YEAR_END_CLOSE',
        status: 'POSTED',
        createdByUserId: session.user.id,
        postedByUserId: session.user.id,
        postedAt: new Date(),
      })
      .returning();
    if (!header) throw new Error('journals insert returned no row');

    // Build the close lines. Each P&L account gets a counter-posting
    // that cancels its current balance; the net goes to Retained
    // Earnings.
    //
    //   For REVENUE / OTHER_INCOME (credit nature):
    //     account balance = credit - debit  (positive = income)
    //     close line: DR account balance, CR RE balance
    //
    //   For COST_OF_SALES / EXPENSE / OTHER_EXPENSE (debit nature):
    //     account balance = debit - credit  (positive = expense)
    //     close line: DR RE balance, CR account balance
    //
    // The RE side nets to (income - expenses) = profit, credited to
    // RE if profit, debited if loss. Debits always equal credits
    // across the whole journal.
    const lines: Array<typeof journalLines.$inferInsert> = [];
    let lineNumber = 1;
    let reNetCents = 0; // positive = profit (credit RE); negative = loss (debit RE)
    for (const b of balances) {
      const d = Math.round(Number.parseFloat(b.debit) * 100);
      const c = Math.round(Number.parseFloat(b.credit) * 100);
      const isIncome = b.accountType === 'REVENUE' || b.accountType === 'OTHER_INCOME';
      const accountBalanceCents = isIncome ? c - d : d - c;
      if (accountBalanceCents === 0) continue;

      const amount = (Math.abs(accountBalanceCents) / 100).toFixed(2);
      if (isIncome) {
        // DR account to zero it out; CR RE to recognise profit.
        lines.push({
          journalId: header.id,
          lineNumber: lineNumber++,
          accountId: b.accountId,
          debit: amount,
          credit: '0',
          currencyCode: 'EUR',
          description: `Close ${b.accountCode}`,
        });
        reNetCents += accountBalanceCents;
      } else {
        // DR RE to recognise expense impact; CR account to zero it.
        lines.push({
          journalId: header.id,
          lineNumber: lineNumber++,
          accountId: b.accountId,
          debit: '0',
          credit: amount,
          currencyCode: 'EUR',
          description: `Close ${b.accountCode}`,
        });
        reNetCents -= accountBalanceCents;
      }
    }

    // Single Retained Earnings line that nets the whole close.
    if (reNetCents > 0) {
      lines.push({
        journalId: header.id,
        lineNumber: lineNumber++,
        accountId: retainedEarnings.id,
        debit: '0',
        credit: (reNetCents / 100).toFixed(2),
        currencyCode: 'EUR',
        description: `Net profit ${year} → Retained Earnings`,
      });
    } else if (reNetCents < 0) {
      lines.push({
        journalId: header.id,
        lineNumber: lineNumber++,
        accountId: retainedEarnings.id,
        debit: (Math.abs(reNetCents) / 100).toFixed(2),
        credit: '0',
        currencyCode: 'EUR',
        description: `Net loss ${year} → Retained Earnings`,
      });
    }

    if (lines.length === 0) {
      throw new BusinessRuleError(
        'NOTHING_TO_CLOSE',
        `All P&L balances for ${year} are already zero — nothing to post.`,
      );
    }

    await tx.insert(journalLines).values(lines);

    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'journal',
      entityId: header.id,
      action: 'YEAR_END_CLOSE',
      after: {
        year,
        journalNumber,
        netProfitCents: reNetCents,
        pnlAccountsClosedCount: balances.length,
      },
    });

    return header;
  });
}

/**
 * Check whether a given year has already been closed. Used by the UI
 * to disable the Close button and show the posting journal link.
 */
export async function fetchYearEndCloseStatus(
  year: number,
): Promise<{ closed: boolean; journalId?: string; journalNumber?: string }> {
  const [row] = await db
    .select({ id: journals.id, number: journals.number })
    .from(journals)
    .where(
      and(
        eq(journals.sourceType, 'YEAR_END_CLOSE'),
        sql`${journals.description} LIKE ${`Year-end close ${year}%`}`,
        eq(journals.status, 'POSTED'),
      ),
    )
    .limit(1);
  if (!row) return { closed: false };
  return { closed: true, journalId: row.id, journalNumber: row.number };
}

// Keep businessDivisions import live so the file compiles even if a
// future revision references it; drizzle re-exports collisions aside,
// this stays a no-op.
void businessDivisions;

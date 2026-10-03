import { asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import {
  accountingPeriods,
  businessDivisions,
  chartOfAccounts,
  financialEvents,
  journalLines,
  journals,
} from '@/lib/db/schema/accounting';
import { users } from '@/lib/db/schema/users';

/**
 * Read-side helpers for the Phase 1 admin surfaces. Everything in here
 * is a plain `db.select(...)` — no mutations. Used by the server
 * components under /admin/accounting/*.
 */

export async function fetchChartOfAccounts() {
  return db
    .select({
      id: chartOfAccounts.id,
      code: chartOfAccounts.code,
      name: chartOfAccounts.name,
      type: chartOfAccounts.type,
      currencyCode: chartOfAccounts.currencyCode,
      active: chartOfAccounts.active,
      allowPosting: chartOfAccounts.allowPosting,
      description: chartOfAccounts.description,
    })
    .from(chartOfAccounts)
    .orderBy(asc(chartOfAccounts.code));
}

export async function fetchBusinessDivisions() {
  return db
    .select({
      id: businessDivisions.id,
      code: businessDivisions.code,
      name: businessDivisions.name,
    })
    .from(businessDivisions)
    .orderBy(asc(businessDivisions.name));
}

export type JournalListRow = {
  id: string;
  number: string;
  journalDate: string;
  postingDate: string;
  description: string;
  status: string;
  transactionCurrency: string;
  totalDebit: string;
  periodYear: number;
  periodMonth: number;
  createdByName: string | null;
};

/**
 * List all journals, newest first. The total (sum of all debits, which
 * by the balance invariant equals the sum of all credits) is a cheap
 * header-level signal of the journal's size without having to open it.
 */
export async function fetchJournals(limit = 100): Promise<JournalListRow[]> {
  const rows = await db
    .select({
      id: journals.id,
      number: journals.number,
      journalDate: journals.journalDate,
      postingDate: journals.postingDate,
      description: journals.description,
      status: journals.status,
      transactionCurrency: journals.transactionCurrency,
      periodYear: accountingPeriods.year,
      periodMonth: accountingPeriods.month,
      createdByName: users.fullName,
      // Correlated SUM — faster than a GROUP BY when fetching a short
      // page; drizzle types this as string because numeric comes back
      // as string from postgres-js.
      totalDebit: sql<string>`(SELECT COALESCE(SUM(debit), 0)::text FROM journal_lines WHERE journal_id = ${journals.id})`,
    })
    .from(journals)
    .innerJoin(accountingPeriods, eq(accountingPeriods.id, journals.periodId))
    .leftJoin(users, eq(users.id, journals.createdByUserId))
    .orderBy(desc(journals.postingDate), desc(journals.number))
    .limit(limit);
  return rows;
}

export type JournalDetail = {
  header: {
    id: string;
    number: string;
    journalDate: string;
    postingDate: string;
    description: string;
    status: string;
    transactionCurrency: string;
    functionalCurrency: string;
    exchangeRate: string;
    createdByName: string | null;
    postedAt: Date | null;
    reversesJournalId: string | null;
    reversesJournalNumber: string | null;
  };
  lines: Array<{
    id: string;
    lineNumber: number;
    accountCode: string;
    accountName: string;
    divisionCode: string | null;
    divisionName: string | null;
    debit: string;
    credit: string;
    currencyCode: string;
    description: string | null;
  }>;
};

export async function fetchJournalWithLines(id: string): Promise<JournalDetail | null> {
  const [header] = await db
    .select({
      id: journals.id,
      number: journals.number,
      journalDate: journals.journalDate,
      postingDate: journals.postingDate,
      description: journals.description,
      status: journals.status,
      transactionCurrency: journals.transactionCurrency,
      functionalCurrency: journals.functionalCurrency,
      exchangeRate: journals.exchangeRate,
      createdByName: users.fullName,
      postedAt: journals.postedAt,
      reversesJournalId: journals.reversesJournalId,
    })
    .from(journals)
    .leftJoin(users, eq(users.id, journals.createdByUserId))
    .where(eq(journals.id, id))
    .limit(1);
  if (!header) return null;

  // Separate query for the reversed journal number — avoids a complex
  // self-join + alias; cheap because we only hit it when the FK is set.
  let reversesJournalNumber: string | null = null;
  if (header.reversesJournalId) {
    const [row] = await db
      .select({ number: journals.number })
      .from(journals)
      .where(eq(journals.id, header.reversesJournalId))
      .limit(1);
    reversesJournalNumber = row?.number ?? null;
  }

  const lines = await db
    .select({
      id: journalLines.id,
      lineNumber: journalLines.lineNumber,
      accountCode: chartOfAccounts.code,
      accountName: chartOfAccounts.name,
      divisionCode: businessDivisions.code,
      divisionName: businessDivisions.name,
      debit: journalLines.debit,
      credit: journalLines.credit,
      currencyCode: journalLines.currencyCode,
      description: journalLines.description,
    })
    .from(journalLines)
    .innerJoin(chartOfAccounts, eq(chartOfAccounts.id, journalLines.accountId))
    .leftJoin(businessDivisions, eq(businessDivisions.id, journalLines.divisionId))
    .where(eq(journalLines.journalId, id))
    .orderBy(asc(journalLines.lineNumber));

  return { header: { ...header, reversesJournalNumber }, lines };
}

export type FinancialEventRow = {
  id: string;
  eventType: string;
  sourceEntity: string;
  sourceId: string;
  sourceEventId: string;
  status: string;
  receivedAt: Date;
  processedAt: Date | null;
  attemptCount: number;
  lastError: string | null;
  journalId: string | null;
};

export async function fetchFinancialEvents(limit = 200): Promise<FinancialEventRow[]> {
  return db
    .select({
      id: financialEvents.id,
      eventType: financialEvents.eventType,
      sourceEntity: financialEvents.sourceEntity,
      sourceId: financialEvents.sourceId,
      sourceEventId: financialEvents.sourceEventId,
      status: financialEvents.status,
      receivedAt: financialEvents.receivedAt,
      processedAt: financialEvents.processedAt,
      attemptCount: financialEvents.attemptCount,
      lastError: financialEvents.lastError,
      journalId: financialEvents.journalId,
    })
    .from(financialEvents)
    .orderBy(desc(financialEvents.receivedAt))
    .limit(limit);
}

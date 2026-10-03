import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import {
  businessDivisions,
  chartOfAccounts,
  journalLines,
  journals,
} from '@/lib/db/schema/accounting';

/**
 * Read-side financial statement generators. All queries aggregate from
 * the immutable journal_lines table — never from the operational
 * invoices / payments / receipts tables — so the numbers here match
 * what the ledger has actually accepted. If the ledger is empty every
 * report returns zero rows; this is correct, not an error.
 *
 * Only POSTED and REVERSED journals contribute to balances (DRAFT and
 * PENDING_APPROVAL are not yet live money). REVERSED journals keep
 * their original lines in the ledger but each is paired with a mirror
 * journal that cancels it, so the net is zero — the trial balance stays
 * balanced across reversals.
 */

export type TrialBalanceRow = {
  accountCode: string;
  accountName: string;
  accountType: string;
  debit: string;
  credit: string;
  balance: string;
};

export type TrialBalance = {
  asOf: string;
  rows: TrialBalanceRow[];
  totals: { debit: string; credit: string; balanced: boolean };
};

/**
 * Aggregate every POSTED journal line up to and including `asOf`, grouped
 * by account, with debit/credit subtotals and the signed balance
 * (debit - credit, which flips sign for liability/revenue/equity rows
 * when rendered — the page handles presentation).
 *
 * Trial Balance must have `sum(debit) == sum(credit)` across all rows.
 * If `balanced=false`, there is a bug in the ledger — report it.
 */
export async function fetchTrialBalance(asOf: Date = new Date()): Promise<TrialBalance> {
  const asOfStr = asOf.toISOString().slice(0, 10);

  const rows = await db
    .select({
      accountCode: chartOfAccounts.code,
      accountName: chartOfAccounts.name,
      accountType: chartOfAccounts.type,
      debit: sql<string>`COALESCE(SUM(${journalLines.debit}), 0)::text`,
      credit: sql<string>`COALESCE(SUM(${journalLines.credit}), 0)::text`,
    })
    .from(chartOfAccounts)
    .leftJoin(journalLines, eq(journalLines.accountId, chartOfAccounts.id))
    .leftJoin(journals, eq(journals.id, journalLines.journalId))
    .where(
      and(
        inArray(journals.status, ['POSTED', 'REVERSED']),
        sql`${journals.postingDate} <= ${asOfStr}`,
      ),
    )
    .groupBy(chartOfAccounts.id, chartOfAccounts.code, chartOfAccounts.name, chartOfAccounts.type)
    .orderBy(asc(chartOfAccounts.code));

  const expanded: TrialBalanceRow[] = rows.map((r) => {
    const d = Math.round(Number.parseFloat(r.debit) * 100);
    const c = Math.round(Number.parseFloat(r.credit) * 100);
    const bal = d - c;
    return {
      accountCode: r.accountCode,
      accountName: r.accountName,
      accountType: r.accountType,
      debit: (d / 100).toFixed(2),
      credit: (c / 100).toFixed(2),
      balance: (bal / 100).toFixed(2),
    };
  });

  const totalDebitCents = expanded.reduce(
    (s, r) => s + Math.round(Number.parseFloat(r.debit) * 100),
    0,
  );
  const totalCreditCents = expanded.reduce(
    (s, r) => s + Math.round(Number.parseFloat(r.credit) * 100),
    0,
  );

  // Suppress all-zero rows — a Trial Balance that lists every account
  // in the chart (including ones that have never been posted to) is
  // noise. Keep them if the balance is non-zero even without current-
  // period activity (future enhancement: opening balances).
  const nonZero = expanded.filter(
    (r) =>
      Number.parseFloat(r.debit) !== 0 ||
      Number.parseFloat(r.credit) !== 0 ||
      Number.parseFloat(r.balance) !== 0,
  );

  return {
    asOf: asOfStr,
    rows: nonZero,
    totals: {
      debit: (totalDebitCents / 100).toFixed(2),
      credit: (totalCreditCents / 100).toFixed(2),
      balanced: totalDebitCents === totalCreditCents,
    },
  };
}

export type ProfitLossRow = {
  accountCode: string;
  accountName: string;
  accountType: 'REVENUE' | 'COST_OF_SALES' | 'EXPENSE' | 'OTHER_INCOME' | 'OTHER_EXPENSE';
  divisionCode: string | null;
  divisionName: string | null;
  amount: string;
};

export type ProfitLoss = {
  from: string;
  to: string;
  revenue: ProfitLossRow[];
  costOfSales: ProfitLossRow[];
  operatingExpense: ProfitLossRow[];
  otherIncome: ProfitLossRow[];
  otherExpense: ProfitLossRow[];
  totals: {
    revenue: string;
    costOfSales: string;
    grossProfit: string;
    operatingExpense: string;
    operatingProfit: string;
    otherIncome: string;
    otherExpense: string;
    netProfit: string;
  };
};

/**
 * Profit & Loss for the period [`from`, `to`]. Groups by (account,
 * division) so staff can slice revenue by business division without a
 * second query. Expenses stay flat per account because they're mostly
 * cross-divisional in this app (rent, software etc. aren't per-division
 * in Phase 2).
 *
 * Amount convention per account type:
 *   REVENUE / OTHER_INCOME: credit - debit (shown positive)
 *   COST_OF_SALES / EXPENSE / OTHER_EXPENSE: debit - credit (shown positive)
 */
export async function fetchProfitLoss(from: Date, to: Date): Promise<ProfitLoss> {
  const fromStr = from.toISOString().slice(0, 10);
  const toStr = to.toISOString().slice(0, 10);

  const rows = await db
    .select({
      accountCode: chartOfAccounts.code,
      accountName: chartOfAccounts.name,
      accountType: chartOfAccounts.type,
      divisionCode: businessDivisions.code,
      divisionName: businessDivisions.name,
      debit: sql<string>`COALESCE(SUM(${journalLines.debit}), 0)::text`,
      credit: sql<string>`COALESCE(SUM(${journalLines.credit}), 0)::text`,
    })
    .from(journalLines)
    .innerJoin(chartOfAccounts, eq(chartOfAccounts.id, journalLines.accountId))
    .innerJoin(journals, eq(journals.id, journalLines.journalId))
    .leftJoin(businessDivisions, eq(businessDivisions.id, journalLines.divisionId))
    .where(
      and(
        inArray(journals.status, ['POSTED', 'REVERSED']),
        sql`${journals.postingDate} BETWEEN ${fromStr} AND ${toStr}`,
        inArray(chartOfAccounts.type, [
          'REVENUE',
          'COST_OF_SALES',
          'EXPENSE',
          'OTHER_INCOME',
          'OTHER_EXPENSE',
        ]),
      ),
    )
    .groupBy(
      chartOfAccounts.id,
      chartOfAccounts.code,
      chartOfAccounts.name,
      chartOfAccounts.type,
      businessDivisions.id,
      businessDivisions.code,
      businessDivisions.name,
    )
    .orderBy(asc(chartOfAccounts.code));

  const build = (filterType: ProfitLossRow['accountType']): ProfitLossRow[] =>
    rows
      .filter((r) => r.accountType === filterType)
      .map((r) => {
        const d = Math.round(Number.parseFloat(r.debit) * 100);
        const c = Math.round(Number.parseFloat(r.credit) * 100);
        const amountCents =
          filterType === 'REVENUE' || filterType === 'OTHER_INCOME' ? c - d : d - c;
        return {
          accountCode: r.accountCode,
          accountName: r.accountName,
          accountType: filterType,
          divisionCode: r.divisionCode,
          divisionName: r.divisionName,
          amount: (amountCents / 100).toFixed(2),
        };
      });

  const revenue = build('REVENUE');
  const costOfSales = build('COST_OF_SALES');
  const operatingExpense = build('EXPENSE');
  const otherIncome = build('OTHER_INCOME');
  const otherExpense = build('OTHER_EXPENSE');

  const sum = (xs: ProfitLossRow[]): number =>
    xs.reduce((s, r) => s + Math.round(Number.parseFloat(r.amount) * 100), 0);

  const revenueCents = sum(revenue);
  const costOfSalesCents = sum(costOfSales);
  const grossProfitCents = revenueCents - costOfSalesCents;
  const operatingExpenseCents = sum(operatingExpense);
  const operatingProfitCents = grossProfitCents - operatingExpenseCents;
  const otherIncomeCents = sum(otherIncome);
  const otherExpenseCents = sum(otherExpense);
  const netProfitCents = operatingProfitCents + otherIncomeCents - otherExpenseCents;

  const fmt = (c: number): string => (c / 100).toFixed(2);

  return {
    from: fromStr,
    to: toStr,
    revenue,
    costOfSales,
    operatingExpense,
    otherIncome,
    otherExpense,
    totals: {
      revenue: fmt(revenueCents),
      costOfSales: fmt(costOfSalesCents),
      grossProfit: fmt(grossProfitCents),
      operatingExpense: fmt(operatingExpenseCents),
      operatingProfit: fmt(operatingProfitCents),
      otherIncome: fmt(otherIncomeCents),
      otherExpense: fmt(otherExpenseCents),
      netProfit: fmt(netProfitCents),
    },
  };
}

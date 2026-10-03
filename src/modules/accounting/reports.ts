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

export type BalanceSheetRow = {
  accountCode: string;
  accountName: string;
  balance: string;
};

export type BalanceSheet = {
  asOf: string;
  assets: BalanceSheetRow[];
  liabilities: BalanceSheetRow[];
  equity: BalanceSheetRow[];
  totals: {
    assets: string;
    liabilities: string;
    equityExcludingCurrentYear: string;
    currentYearProfit: string;
    equity: string;
    liabilitiesPlusEquity: string;
    balanced: boolean;
  };
};

/**
 * Balance sheet at `asOf`. Three sections:
 *
 *   Assets      = sum(debit - credit) across ASSET accounts
 *   Liabilities = sum(credit - debit) across LIABILITY accounts
 *   Equity      = sum(credit - debit) across EQUITY accounts
 *                + current-year profit (REVENUE+OTHER_INCOME net of
 *                  COST_OF_SALES+EXPENSE+OTHER_EXPENSE for the year
 *                  containing asOf)
 *
 * Current-year profit shows up as a synthetic equity line because the
 * P&L hasn't been "closed" yet in Phase 1-5 — a year-end close journal
 * would normally move the balance into Retained Earnings. Until that
 * exists, the synthetic line keeps the sheet balanced without
 * requiring the operator to post an opening-balance / close-out
 * journal every January.
 *
 * `balanced` = Total Assets == Total Liabilities + Equity. If false,
 * the ledger has drifted — same signal as Trial Balance.
 */
export async function fetchBalanceSheet(asOf: Date = new Date()): Promise<BalanceSheet> {
  const asOfStr = asOf.toISOString().slice(0, 10);
  const yearStartStr = `${asOf.getUTCFullYear()}-01-01`;

  // Grab every account's net balance up to asOf. Account type drives
  // sign conventions in the mapper below.
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

  const assets: BalanceSheetRow[] = [];
  const liabilities: BalanceSheetRow[] = [];
  const equity: BalanceSheetRow[] = [];
  let assetsCents = 0;
  let liabilitiesCents = 0;
  let equityCents = 0;

  for (const r of rows) {
    const d = Math.round(Number.parseFloat(r.debit) * 100);
    const c = Math.round(Number.parseFloat(r.credit) * 100);
    if (r.accountType === 'ASSET') {
      const bal = d - c;
      if (bal === 0) continue;
      assets.push({
        accountCode: r.accountCode,
        accountName: r.accountName,
        balance: (bal / 100).toFixed(2),
      });
      assetsCents += bal;
    } else if (r.accountType === 'LIABILITY') {
      const bal = c - d;
      if (bal === 0) continue;
      liabilities.push({
        accountCode: r.accountCode,
        accountName: r.accountName,
        balance: (bal / 100).toFixed(2),
      });
      liabilitiesCents += bal;
    } else if (r.accountType === 'EQUITY') {
      const bal = c - d;
      if (bal === 0) continue;
      equity.push({
        accountCode: r.accountCode,
        accountName: r.accountName,
        balance: (bal / 100).toFixed(2),
      });
      equityCents += bal;
    }
    // REVENUE / COST_OF_SALES / EXPENSE / OTHER_INCOME / OTHER_EXPENSE
    // are rolled up separately via the YTD query below.
  }

  // Current-year profit: income minus expenses for POSTED journals in
  // the current calendar year up to asOf. Separate query so we don't
  // conflate opening balances (which should have carried over to
  // Retained Earnings) with current-year movement.
  const [profitRow] = await db
    .select({
      incomeDebit: sql<string>`COALESCE(SUM(CASE WHEN ${chartOfAccounts.type} IN ('REVENUE','OTHER_INCOME') THEN ${journalLines.debit} ELSE 0 END), 0)::text`,
      incomeCredit: sql<string>`COALESCE(SUM(CASE WHEN ${chartOfAccounts.type} IN ('REVENUE','OTHER_INCOME') THEN ${journalLines.credit} ELSE 0 END), 0)::text`,
      expenseDebit: sql<string>`COALESCE(SUM(CASE WHEN ${chartOfAccounts.type} IN ('COST_OF_SALES','EXPENSE','OTHER_EXPENSE') THEN ${journalLines.debit} ELSE 0 END), 0)::text`,
      expenseCredit: sql<string>`COALESCE(SUM(CASE WHEN ${chartOfAccounts.type} IN ('COST_OF_SALES','EXPENSE','OTHER_EXPENSE') THEN ${journalLines.credit} ELSE 0 END), 0)::text`,
    })
    .from(journalLines)
    .innerJoin(chartOfAccounts, eq(chartOfAccounts.id, journalLines.accountId))
    .innerJoin(journals, eq(journals.id, journalLines.journalId))
    .where(
      and(
        inArray(journals.status, ['POSTED', 'REVERSED']),
        sql`${journals.postingDate} BETWEEN ${yearStartStr} AND ${asOfStr}`,
        inArray(chartOfAccounts.type, [
          'REVENUE',
          'OTHER_INCOME',
          'COST_OF_SALES',
          'EXPENSE',
          'OTHER_EXPENSE',
        ]),
      ),
    );

  const incomeNetCents = profitRow
    ? Math.round(Number.parseFloat(profitRow.incomeCredit) * 100) -
      Math.round(Number.parseFloat(profitRow.incomeDebit) * 100)
    : 0;
  const expenseNetCents = profitRow
    ? Math.round(Number.parseFloat(profitRow.expenseDebit) * 100) -
      Math.round(Number.parseFloat(profitRow.expenseCredit) * 100)
    : 0;
  const currentYearProfitCents = incomeNetCents - expenseNetCents;

  const totalEquityCents = equityCents + currentYearProfitCents;
  const liabPlusEquityCents = liabilitiesCents + totalEquityCents;

  const cents = (n: number): string => (n / 100).toFixed(2);

  return {
    asOf: asOfStr,
    assets,
    liabilities,
    equity,
    totals: {
      assets: cents(assetsCents),
      liabilities: cents(liabilitiesCents),
      equityExcludingCurrentYear: cents(equityCents),
      currentYearProfit: cents(currentYearProfitCents),
      equity: cents(totalEquityCents),
      liabilitiesPlusEquity: cents(liabPlusEquityCents),
      balanced: assetsCents === liabPlusEquityCents,
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

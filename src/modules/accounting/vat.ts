import { and, asc, between, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { businessDivisions, taxTransactions } from '@/lib/db/schema/accounting';

/**
 * VAT reporting (Phase 5). All queries read exclusively from
 * `tax_transactions` — populated by the outbox-drain for every
 * INVOICE_POSTED (and future supplier bills) with non-zero tax. Journal
 * lines are the ledger truth; this subledger is the return-filing
 * surface.
 *
 * Terminology mirrors the Irish VAT3 return:
 *   T1  = Total VAT on sales (OUTPUT direction) — what we owe Revenue
 *   T2  = Total VAT on purchases (INPUT direction) — what we recover
 *   T3  = Net VAT payable (T1 - T2); negative = T4 (repayable)
 *
 * Current app has no AP flow so T2 is always 0 and T3 equals T1. Phase
 * 7+ (supplier bills) populates INPUT and this service will return
 * meaningful T2 then without any code change.
 */

export type VatSummaryRateRow = {
  taxCode: string;
  taxRatePercent: string;
  netAmount: string;
  taxAmount: string;
  transactionCount: number;
};

export type VatSummaryDivisionRow = {
  divisionCode: string | null;
  divisionName: string | null;
  netAmount: string;
  taxAmount: string;
  transactionCount: number;
};

export type VatSummary = {
  from: string;
  to: string;
  /** Output VAT breakdown by rate — one row per distinct (tax_code, tax_rate_percent). */
  outputByRate: VatSummaryRateRow[];
  /** Output VAT breakdown by business division. */
  outputByDivision: VatSummaryDivisionRow[];
  /** Input VAT breakdown by rate (populated once Phase 7 AP ships). */
  inputByRate: VatSummaryRateRow[];
  totals: {
    /** T1 — VAT on sales. */
    t1: string;
    /** T2 — VAT on purchases (recoverable). */
    t2: string;
    /** T3 — net VAT payable (T1 - T2) if positive. */
    t3: string;
    /** T4 — net VAT repayable (T2 - T1) if positive. */
    t4: string;
    /** Net turnover (sum of net amounts on OUTPUT rows). */
    netSalesTurnover: string;
    /** Net purchases (sum of net amounts on INPUT rows). */
    netPurchases: string;
  };
};

export async function fetchVatSummary(from: Date, to: Date): Promise<VatSummary> {
  const fromStr = from.toISOString().slice(0, 10);
  const toStr = to.toISOString().slice(0, 10);

  const byRate = async (direction: 'OUTPUT' | 'INPUT'): Promise<VatSummaryRateRow[]> =>
    (
      await db
        .select({
          taxCode: taxTransactions.taxCode,
          taxRatePercent: taxTransactions.taxRatePercent,
          netAmount: sql<string>`COALESCE(SUM(${taxTransactions.netAmount}), 0)::text`,
          taxAmount: sql<string>`COALESCE(SUM(${taxTransactions.taxAmount}), 0)::text`,
          transactionCount: sql<string>`COUNT(*)::text`,
        })
        .from(taxTransactions)
        .where(
          and(
            eq(taxTransactions.direction, direction),
            between(taxTransactions.transactionDate, fromStr, toStr),
          ),
        )
        .groupBy(taxTransactions.taxCode, taxTransactions.taxRatePercent)
        .orderBy(asc(taxTransactions.taxRatePercent), asc(taxTransactions.taxCode))
    ).map((r) => ({
      taxCode: r.taxCode,
      taxRatePercent: r.taxRatePercent,
      netAmount: r.netAmount,
      taxAmount: r.taxAmount,
      transactionCount: Number.parseInt(r.transactionCount, 10),
    }));

  const outputByRate = await byRate('OUTPUT');
  const inputByRate = await byRate('INPUT');

  const outputByDivision: VatSummaryDivisionRow[] = (
    await db
      .select({
        divisionCode: businessDivisions.code,
        divisionName: businessDivisions.name,
        netAmount: sql<string>`COALESCE(SUM(${taxTransactions.netAmount}), 0)::text`,
        taxAmount: sql<string>`COALESCE(SUM(${taxTransactions.taxAmount}), 0)::text`,
        transactionCount: sql<string>`COUNT(*)::text`,
      })
      .from(taxTransactions)
      .leftJoin(businessDivisions, eq(businessDivisions.id, taxTransactions.divisionId))
      .where(
        and(
          eq(taxTransactions.direction, 'OUTPUT'),
          between(taxTransactions.transactionDate, fromStr, toStr),
        ),
      )
      .groupBy(businessDivisions.id, businessDivisions.code, businessDivisions.name)
      .orderBy(asc(businessDivisions.code))
  ).map((r) => ({
    divisionCode: r.divisionCode,
    divisionName: r.divisionName,
    netAmount: r.netAmount,
    taxAmount: r.taxAmount,
    transactionCount: Number.parseInt(r.transactionCount, 10),
  }));

  // Sum via cents so float noise can't leak into the headline T3.
  const sumCents = (xs: VatSummaryRateRow[]): { net: number; tax: number } =>
    xs.reduce(
      (acc, r) => ({
        net: acc.net + Math.round(Number.parseFloat(r.netAmount) * 100),
        tax: acc.tax + Math.round(Number.parseFloat(r.taxAmount) * 100),
      }),
      { net: 0, tax: 0 },
    );

  const outSum = sumCents(outputByRate);
  const inSum = sumCents(inputByRate);
  const netVatCents = outSum.tax - inSum.tax;

  const cents = (n: number): string => (n / 100).toFixed(2);

  return {
    from: fromStr,
    to: toStr,
    outputByRate,
    outputByDivision,
    inputByRate,
    totals: {
      t1: cents(outSum.tax),
      t2: cents(inSum.tax),
      t3: cents(Math.max(netVatCents, 0)),
      t4: cents(Math.max(-netVatCents, 0)),
      netSalesTurnover: cents(outSum.net),
      netPurchases: cents(inSum.net),
    },
  };
}

/**
 * Flat row listing used by the CSV export. One row per tax_transactions
 * entry in the range — downloadable so finance can reconcile against
 * the VAT3 figures line-by-line before filing.
 */
export type VatDetailRow = {
  transactionDate: string;
  sourceType: string;
  sourceId: string;
  direction: string;
  taxCode: string;
  taxRatePercent: string;
  netAmount: string;
  taxAmount: string;
  currencyCode: string;
  divisionCode: string | null;
  description: string | null;
};

export async function fetchVatDetail(from: Date, to: Date): Promise<VatDetailRow[]> {
  const fromStr = from.toISOString().slice(0, 10);
  const toStr = to.toISOString().slice(0, 10);
  const rows = await db
    .select({
      transactionDate: taxTransactions.transactionDate,
      sourceType: taxTransactions.sourceType,
      sourceId: taxTransactions.sourceId,
      direction: taxTransactions.direction,
      taxCode: taxTransactions.taxCode,
      taxRatePercent: taxTransactions.taxRatePercent,
      netAmount: taxTransactions.netAmount,
      taxAmount: taxTransactions.taxAmount,
      currencyCode: taxTransactions.currencyCode,
      divisionCode: businessDivisions.code,
      description: taxTransactions.description,
    })
    .from(taxTransactions)
    .leftJoin(businessDivisions, eq(businessDivisions.id, taxTransactions.divisionId))
    .where(between(taxTransactions.transactionDate, fromStr, toStr))
    .orderBy(asc(taxTransactions.transactionDate), asc(taxTransactions.sourceId));
  return rows;
}

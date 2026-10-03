// `./_bootstrap-env` must be the first import: it sets placeholder values
// for the AUTH_SECRET / AUTH_URL / AWS_REGION / S3_BUCKET_DOCUMENTS keys
// that env.ts's zod validator demands at module load. Only DATABASE_URL
// is actually used by this script.
import './_bootstrap-env';
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { accountingRules, businessDivisions, chartOfAccounts } from '@/lib/db/schema/accounting';

/**
 * One-time seed for the double-entry ledger. Idempotent — safe to run
 * multiple times; each row is inserted via ON CONFLICT DO NOTHING on its
 * unique code so re-runs don't duplicate or overwrite.
 *
 * Seeds:
 *   - `business_divisions` — mirror of src/lib/auth/permissions.ts
 *     BUSINESSES constant (candidate_services / recruitment /
 *     immigration / main).
 *   - `chart_of_accounts` — a minimal Irish-business starter chart.
 *     Account codes follow the standard 4-digit convention; parent /
 *     child hierarchy is left flat in Phase 1 and can be extended via
 *     the admin UI later.
 *
 * Run via:  pnpm tsx scripts/seed-accounting.ts
 */

type Division = { code: string; name: string };
const DIVISIONS: Division[] = [
  { code: 'main', name: 'Main (consolidated)' },
  { code: 'candidate_services', name: 'Candidate Services' },
  { code: 'recruitment', name: 'Recruitment' },
  { code: 'immigration', name: 'Immigration' },
];

type AccountSeed = {
  code: string;
  name: string;
  type:
    | 'ASSET'
    | 'LIABILITY'
    | 'EQUITY'
    | 'REVENUE'
    | 'COST_OF_SALES'
    | 'EXPENSE'
    | 'OTHER_INCOME'
    | 'OTHER_EXPENSE';
  description?: string;
};

const ACCOUNTS: AccountSeed[] = [
  // ─── Assets ────────────────────────────────────────────────────
  { code: '1000', name: 'Cash', type: 'ASSET' },
  { code: '1010', name: 'Bank Accounts', type: 'ASSET' },
  { code: '1020', name: 'Payment Processor Clearing', type: 'ASSET' },
  {
    code: '1100',
    name: 'Accounts Receivable',
    type: 'ASSET',
    description: 'Customer invoices awaiting payment.',
  },
  { code: '1200', name: 'Prepayments', type: 'ASSET' },

  // ─── Liabilities ───────────────────────────────────────────────
  { code: '2000', name: 'Accounts Payable', type: 'LIABILITY' },
  { code: '2100', name: 'VAT Payable', type: 'LIABILITY' },
  { code: '2300', name: 'Deferred Revenue', type: 'LIABILITY' },
  {
    code: '2400',
    name: 'Customer Deposits',
    type: 'LIABILITY',
    description: 'Payments received before an invoice is raised.',
  },
  { code: '2600', name: 'Commission Payable', type: 'LIABILITY' },

  // ─── Equity ────────────────────────────────────────────────────
  { code: '3000', name: 'Share Capital', type: 'EQUITY' },
  { code: '3100', name: 'Retained Earnings', type: 'EQUITY' },
  { code: '3200', name: 'Current Year P&L', type: 'EQUITY' },

  // ─── Revenue (per division) ────────────────────────────────────
  {
    code: '4100',
    name: 'Candidate Services Revenue',
    type: 'REVENUE',
    description: 'Lead → engagement billing on the candidate side.',
  },
  {
    code: '4200',
    name: 'Recruitment Revenue',
    type: 'REVENUE',
    description: 'Employer placement fees and recruitment services.',
  },
  {
    code: '4300',
    name: 'Immigration Revenue',
    type: 'REVENUE',
    description: 'Immigration case fees charged to the applicant / sponsor.',
  },
  { code: '4700', name: 'Other Revenue', type: 'REVENUE' },

  // ─── Cost of Sales ─────────────────────────────────────────────
  { code: '5000', name: 'Recruitment Costs', type: 'COST_OF_SALES' },
  { code: '5100', name: 'Immigration Processing Costs', type: 'COST_OF_SALES' },
  { code: '5200', name: 'External Professional Fees', type: 'COST_OF_SALES' },

  // ─── Operating Expenses ────────────────────────────────────────
  { code: '6000', name: 'Salaries', type: 'EXPENSE' },
  { code: '6100', name: 'Rent', type: 'EXPENSE' },
  { code: '6300', name: 'Software', type: 'EXPENSE' },
  { code: '6400', name: 'Advertising', type: 'EXPENSE' },
  { code: '6600', name: 'Legal', type: 'EXPENSE' },
  { code: '6700', name: 'Accounting', type: 'EXPENSE' },
  { code: '7000', name: 'Bank Fees', type: 'EXPENSE' },
  { code: '7100', name: 'Payment Processing Fees', type: 'EXPENSE' },
  { code: '7300', name: 'Bad Debt', type: 'EXPENSE' },
  { code: '7400', name: 'Foreign Exchange Loss', type: 'EXPENSE' },
];

async function main() {
  let divInserted = 0;
  let divSkipped = 0;
  for (const d of DIVISIONS) {
    const existing = await db
      .select({ id: businessDivisions.id })
      .from(businessDivisions)
      .where(eq(businessDivisions.code, d.code))
      .limit(1);
    if (existing.length > 0) {
      divSkipped++;
      continue;
    }
    await db.insert(businessDivisions).values({ code: d.code, name: d.name });
    divInserted++;
  }
  console.log(`business_divisions: ${divInserted} inserted, ${divSkipped} already present`);

  let accInserted = 0;
  let accSkipped = 0;
  for (const a of ACCOUNTS) {
    const existing = await db
      .select({ id: chartOfAccounts.id })
      .from(chartOfAccounts)
      .where(eq(chartOfAccounts.code, a.code))
      .limit(1);
    if (existing.length > 0) {
      accSkipped++;
      continue;
    }
    await db.insert(chartOfAccounts).values({
      code: a.code,
      name: a.name,
      type: a.type,
      description: a.description,
    });
    accInserted++;
  }
  console.log(`chart_of_accounts: ${accInserted} inserted, ${accSkipped} already present`);

  // ─── accounting_rules (Phase 2) ────────────────────────────────
  // Three events × three operational divisions, each with PRINCIPAL and
  // (where applicable) TAX line roles. Currency-wildcard so EUR and
  // ZAR flow through the same rule; add currency-specific rules later
  // if the chart grows e.g. a ZAR-only bank account.
  //
  // Debits/credits are expressed FROM THE LEDGER'S PERSPECTIVE:
  //   INVOICE_POSTED      — DR AR  CR Revenue;  TAX line CR VAT Payable
  //   CREDIT_NOTE_POSTED  — same rule row; outbox-drain flips signs
  //                          because the event's subtotal arrives negative
  //   PAYMENT_RECEIVED    — DR Bank  CR AR (no TAX — recognised at invoice)
  const RULES: Array<{
    eventType: string;
    divisionCode: string | null;
    lineRole: 'PRINCIPAL' | 'TAX';
    debit: string;
    credit: string;
    priority: number;
  }> = [
    // INVOICE_POSTED — principal per division
    {
      eventType: 'INVOICE_POSTED',
      divisionCode: 'candidate_services',
      lineRole: 'PRINCIPAL',
      debit: '1100',
      credit: '4100',
      priority: 10,
    },
    {
      eventType: 'INVOICE_POSTED',
      divisionCode: 'recruitment',
      lineRole: 'PRINCIPAL',
      debit: '1100',
      credit: '4200',
      priority: 10,
    },
    {
      eventType: 'INVOICE_POSTED',
      divisionCode: 'immigration',
      lineRole: 'PRINCIPAL',
      debit: '1100',
      credit: '4300',
      priority: 10,
    },
    // INVOICE_POSTED — tax (division-agnostic — VAT goes to one account regardless)
    {
      eventType: 'INVOICE_POSTED',
      divisionCode: null,
      lineRole: 'TAX',
      debit: '1100',
      credit: '2100',
      priority: 100,
    },

    // CREDIT_NOTE_POSTED — reuses the same account pairs; the drainer
    // flips signs because the event payload sends negative amounts.
    {
      eventType: 'CREDIT_NOTE_POSTED',
      divisionCode: 'candidate_services',
      lineRole: 'PRINCIPAL',
      debit: '1100',
      credit: '4100',
      priority: 10,
    },
    {
      eventType: 'CREDIT_NOTE_POSTED',
      divisionCode: 'recruitment',
      lineRole: 'PRINCIPAL',
      debit: '1100',
      credit: '4200',
      priority: 10,
    },
    {
      eventType: 'CREDIT_NOTE_POSTED',
      divisionCode: 'immigration',
      lineRole: 'PRINCIPAL',
      debit: '1100',
      credit: '4300',
      priority: 10,
    },

    // PAYMENT_RECEIVED — one wildcard rule (bank <- AR regardless of division)
    {
      eventType: 'PAYMENT_RECEIVED',
      divisionCode: null,
      lineRole: 'PRINCIPAL',
      debit: '1010',
      credit: '1100',
      priority: 100,
    },
  ];

  // Rely on the `(event_type, division_code, currency_code, line_role,
  // effective_from)` UNIQUE constraint for idempotency. ON CONFLICT DO
  // NOTHING turns a replay into a no-op without needing a pre-check
  // round-trip per row.
  const today = new Date().toISOString().slice(0, 10);
  const toInsert = RULES.map((r) => ({
    eventType: r.eventType,
    divisionCode: r.divisionCode,
    currencyCode: null,
    debitAccountCode: r.debit,
    creditAccountCode: r.credit,
    lineRole: r.lineRole,
    priority: r.priority,
    effectiveFrom: today,
  }));
  const inserted = await db
    .insert(accountingRules)
    .values(toInsert)
    .onConflictDoNothing({
      target: [
        accountingRules.eventType,
        accountingRules.divisionCode,
        accountingRules.currencyCode,
        accountingRules.lineRole,
        accountingRules.effectiveFrom,
      ],
    })
    .returning({ id: accountingRules.id });
  console.log(
    `accounting_rules: ${inserted.length} inserted, ${toInsert.length - inserted.length} already present`,
  );

  console.log('✓ accounting seed complete');
  process.exit(0);
}

main().catch((err) => {
  console.error('✗ accounting seed failed:', err);
  process.exit(1);
});

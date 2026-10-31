import { e2eAdminId } from './owner';

/**
 * Finance Stage 6G — deterministic finance records for browser tests and
 * before/after screenshots. The local dev ledger is otherwise empty (no
 * periods, journals, suppliers or bills) and has no employer receipts.
 *
 * Seeds, all tagged with a unique stamp and owned by the E2E admin:
 *  - an employer payer with two invoices: one PAID (verified payment +
 *    receipt) and one PARTIALLY_PAID (verified part payment + receipt);
 *  - a supplier with three bills: POSTED (unpaid), PARTIALLY_PAID and PAID,
 *    with bill payments;
 *  - the current accounting period if it does not exist yet, and seven
 *    POSTED journals across asset / liability / revenue / expense accounts,
 *    including a REVERSED journal and its reversal;
 *  - matching OUTPUT / INPUT VAT rows so the VAT return has figures.
 *
 * Rows are inserted directly, mirroring the app's own insert helpers
 * (insertInvoice / insertReceipt / postManualJournal / postSupplierBill),
 * including the shared `document_sequences` numbering. No financial events
 * or audit rows are written. `cleanup()` removes exactly what was created;
 * the only lasting side effect is that the INV / RCT / BILL / JRN sequence
 * counters have moved on (numbers are never reused, as in production).
 */

async function mods() {
  const { config: loadEnv } = await import('dotenv');
  loadEnv({ path: '.env.local' });
  const { inArray, sql, eq, and } = await import('drizzle-orm');
  const { db } = await import('../../src/lib/db/client');
  const billing = await import('../../src/lib/db/schema/billing');
  const commerce = await import('../../src/lib/db/schema/commerce');
  const ap = await import('../../src/lib/db/schema/ap');
  const accounting = await import('../../src/lib/db/schema/accounting');
  const recruitment = await import('../../src/lib/db/schema/recruitment');
  return {
    db,
    inArray,
    sql,
    eq,
    and,
    s: { ...billing, ...commerce, ...ap, ...accounting, ...recruitment },
  };
}

type Mods = Awaited<ReturnType<typeof mods>>;
type Tx = Parameters<Parameters<Mods['db']['transaction']>[0]>[0];

const stamp = () => Math.random().toString(36).slice(2, 7);
const NONE = '00000000-0000-0000-0000-000000000000';
const day = 86_400_000;
const isoDate = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * day).toISOString().slice(0, 10);

async function nextNumber(m: Mods, tx: Tx, prefix: 'INV' | 'RCT' | 'BILL' | 'JRN') {
  const year = new Date().getUTCFullYear();
  const [row] = await tx
    .insert(m.s.documentSequences)
    .values({ prefix, year, currentValue: 1 })
    .onConflictDoUpdate({
      target: [m.s.documentSequences.prefix, m.s.documentSequences.year],
      set: {
        currentValue: m.sql`${m.s.documentSequences.currentValue} + 1`,
        updatedAt: m.sql`NOW()`,
      },
    })
    .returning({ currentValue: m.s.documentSequences.currentValue });
  if (!row) throw new Error('sequence upsert failed');
  return `${prefix}-${year}-${String(row.currentValue).padStart(6, '0')}`;
}

export type FinanceScenario = Awaited<ReturnType<typeof seedFinanceScenario>>;

export async function seedFinanceScenario() {
  const m = await mods();
  const tag = stamp();
  const owner = await e2eAdminId();
  const ids = {
    employers: [] as string[],
    engagements: [] as string[],
    invoices: [] as string[],
    payments: [] as string[],
    receipts: [] as string[],
    suppliers: [] as string[],
    bills: [] as string[],
    billPayments: [] as string[],
    journals: [] as string[],
    taxTransactions: [] as string[],
    periods: [] as string[],
  };

  const svcRows = (await m.db.execute(
    m.sql`select id, name from service_catalog_items order by name limit 1`,
  )) as unknown as Array<{ id: string; name: string }>;
  const svc = svcRows[0];
  if (!svc) throw new Error('no service catalog item to bill against');

  // ── Employer payer, two invoices, payments and receipts ─────────────
  const [employer] = await m.db
    .insert(m.s.employers)
    .values({ assignedUserId: owner, legalName: `Finfix ${tag} Holdings Ltd`, city: 'Dublin' })
    .returning({ id: m.s.employers.id });
  if (!employer) throw new Error('employer insert failed');
  ids.employers.push(employer.id);

  async function employerInvoice(opts: {
    unit: string;
    tax: string;
    total: string;
    paid: string;
    status: 'PAID' | 'PARTIALLY_PAID';
    description: string;
    paidDaysAgo: number;
  }) {
    return m.db.transaction(async (tx) => {
      const [eng] = await tx
        .insert(m.s.serviceEngagements)
        .values({
          serviceCatalogItemId: svc.id,
          payerEmployerId: employer.id,
          agreedAmount: opts.total,
          currencyCode: 'EUR',
          status: 'ACTIVE',
          notes: `finfix ${tag}`,
        })
        .returning({ id: m.s.serviceEngagements.id });
      if (!eng) throw new Error('engagement insert failed');
      ids.engagements.push(eng.id);
      const number = await nextNumber(m, tx, 'INV');
      const [inv] = await tx
        .insert(m.s.invoices)
        .values({
          number,
          payerEmployerId: employer.id,
          serviceEngagementId: eng.id,
          qty: 1,
          unitPrice: opts.unit,
          subtotal: opts.unit,
          taxAmount: opts.tax,
          totalAmount: opts.total,
          currencyCode: 'EUR',
          lineDescription: opts.description,
          issuedByUserId: owner,
          issuedAt: new Date(Date.now() - (opts.paidDaysAgo + 5) * day),
          dueAt: new Date(Date.now() + 25 * day),
          status: opts.status,
        })
        .returning({ id: m.s.invoices.id, number: m.s.invoices.number });
      if (!inv) throw new Error('invoice insert failed');
      ids.invoices.push(inv.id);
      await tx.insert(m.s.invoiceLineItems).values({
        invoiceId: inv.id,
        serviceCatalogItemId: svc.id,
        description: opts.description,
        quantity: '1',
        unitPrice: opts.unit,
        lineSubtotal: opts.unit,
        sortOrder: 0,
      });
      const receivedAt = new Date(Date.now() - opts.paidDaysAgo * day);
      const [pay] = await tx
        .insert(m.s.payments)
        .values({
          serviceEngagementId: eng.id,
          amount: opts.paid,
          currencyCode: 'EUR',
          method: 'BANK_TRANSFER',
          status: 'VERIFIED',
          proofReference: `BOI-${tag.toUpperCase()}-${ids.payments.length + 1}`,
          receivedAt,
          verifiedByUserId: owner,
          verifiedAt: receivedAt,
        })
        .returning({ id: m.s.payments.id });
      if (!pay) throw new Error('payment insert failed');
      ids.payments.push(pay.id);
      const rct = await nextNumber(m, tx, 'RCT');
      const [receipt] = await tx
        .insert(m.s.receipts)
        .values({
          number: rct,
          paymentId: pay.id,
          invoiceId: inv.id,
          payerEmployerId: employer.id,
          amount: opts.paid,
          currencyCode: 'EUR',
          receivedAt,
          issuedByUserId: owner,
        })
        .returning({ id: m.s.receipts.id, number: m.s.receipts.number });
      if (!receipt) throw new Error('receipt insert failed');
      ids.receipts.push(receipt.id);
      return {
        invoiceNumber: inv.number,
        receiptNumber: receipt.number,
        total: opts.total,
        paid: opts.paid,
      };
    });
  }

  const paidInvoice = await employerInvoice({
    unit: '1000.00',
    tax: '230.00',
    total: '1230.00',
    paid: '1230.00',
    status: 'PAID',
    description: 'Recruitment placement fee — Senior Software Engineer',
    paidDaysAgo: 3,
  });
  const partInvoice = await employerInvoice({
    unit: '2500.00',
    tax: '575.00',
    total: '3075.00',
    paid: '1000.00',
    status: 'PARTIALLY_PAID',
    description: 'Retained search — Finance Manager (first instalment)',
    paidDaysAgo: 1,
  });

  // ── Supplier with three bills ───────────────────────────────────────
  const [supplier] = await m.db
    .insert(m.s.suppliers)
    .values({
      legalName: `Finfix ${tag} Office Services Ltd`,
      email: `accounts-${tag}@finfix.test`,
      phone: '+353 1 555 0100',
      country: 'IE',
      currencyCode: 'EUR',
      paymentTermsDays: 30,
    })
    .returning({ id: m.s.suppliers.id, legalName: m.s.suppliers.legalName });
  if (!supplier) throw new Error('supplier insert failed');
  ids.suppliers.push(supplier.id);

  async function bill(opts: {
    subtotal: string;
    tax: string;
    total: string;
    account: string;
    description: string;
    status: 'POSTED' | 'PARTIALLY_PAID' | 'PAID';
    paid?: string;
    billDaysAgo: number;
  }) {
    return m.db.transaction(async (tx) => {
      const number = await nextNumber(m, tx, 'BILL');
      const [row] = await tx
        .insert(m.s.supplierBills)
        .values({
          number,
          supplierId: supplier.id,
          supplierReference: `SUP-${tag.toUpperCase()}-${ids.bills.length + 1}`,
          billDate: isoDate(-opts.billDaysAgo),
          dueDate: isoDate(30 - opts.billDaysAgo),
          currencyCode: 'EUR',
          subtotal: opts.subtotal,
          taxAmount: opts.tax,
          totalAmount: opts.total,
          expenseAccountCode: opts.account,
          description: opts.description,
          status: opts.status,
          createdByUserId: owner,
        })
        .returning({ id: m.s.supplierBills.id, number: m.s.supplierBills.number });
      if (!row) throw new Error('bill insert failed');
      ids.bills.push(row.id);
      if (opts.paid) {
        const [bp] = await tx
          .insert(m.s.billPayments)
          .values({
            billId: row.id,
            paymentDate: isoDate(-1),
            amount: opts.paid,
            currencyCode: 'EUR',
            method: 'BANK_TRANSFER',
            reference: `PAY-${tag.toUpperCase()}-${ids.billPayments.length + 1}`,
            createdByUserId: owner,
          })
          .returning({ id: m.s.billPayments.id });
        if (!bp) throw new Error('bill payment insert failed');
        ids.billPayments.push(bp.id);
      }
      return row;
    });
  }

  const billOpen = await bill({
    subtotal: '500.00',
    tax: '115.00',
    total: '615.00',
    account: '6300',
    description: 'Annual CRM software licence',
    status: 'POSTED',
    billDaysAgo: 6,
  });
  const billPart = await bill({
    subtotal: '1200.00',
    tax: '276.00',
    total: '1476.00',
    account: '5200',
    description: 'Immigration legal review — Q4 retainer',
    status: 'PARTIALLY_PAID',
    paid: '600.00',
    billDaysAgo: 12,
  });
  const billPaid = await bill({
    subtotal: '80.00',
    tax: '0.00',
    total: '80.00',
    account: '6100',
    description: 'Meeting room hire',
    status: 'PAID',
    paid: '80.00',
    billDaysAgo: 4,
  });

  // ── Accounting period + journals ────────────────────────────────────
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const [existingPeriod] = await m.db
    .select({ id: m.s.accountingPeriods.id, status: m.s.accountingPeriods.status })
    .from(m.s.accountingPeriods)
    .where(m.and(m.eq(m.s.accountingPeriods.year, year), m.eq(m.s.accountingPeriods.month, month)))
    .limit(1);
  let periodId = existingPeriod?.id;
  if (!periodId) {
    const [p] = await m.db
      .insert(m.s.accountingPeriods)
      .values({ year, month, status: 'OPEN' })
      .returning({ id: m.s.accountingPeriods.id });
    if (!p) throw new Error('period insert failed');
    periodId = p.id;
    ids.periods.push(p.id);
  }

  const accountRows = await m.db
    .select({ id: m.s.chartOfAccounts.id, code: m.s.chartOfAccounts.code })
    .from(m.s.chartOfAccounts);
  const acct = new Map(accountRows.map((a) => [a.code, a.id]));
  const divRows = await m.db
    .select({ id: m.s.businessDivisions.id, code: m.s.businessDivisions.code })
    .from(m.s.businessDivisions);
  const div = new Map(divRows.map((d) => [d.code, d.id]));

  type Line = { code: string; debit?: string; credit?: string; division?: string; text?: string };
  async function journal(description: string, lines: Line[], reverses?: string) {
    return m.db.transaction(async (tx) => {
      const number = await nextNumber(m, tx, 'JRN');
      const [h] = await tx
        .insert(m.s.journals)
        .values({
          number,
          journalDate: isoDate(0),
          postingDate: isoDate(0),
          periodId: periodId as string,
          transactionCurrency: 'EUR',
          functionalCurrency: 'EUR',
          exchangeRate: '1',
          description,
          sourceType: 'MANUAL',
          status: 'POSTED',
          createdByUserId: owner,
          postedByUserId: owner,
          postedAt: new Date(),
          reversesJournalId: reverses ?? null,
        })
        .returning({ id: m.s.journals.id, number: m.s.journals.number });
      if (!h) throw new Error('journal insert failed');
      ids.journals.push(h.id);
      await tx.insert(m.s.journalLines).values(
        lines.map((l, i) => {
          const accountId = acct.get(l.code);
          if (!accountId) throw new Error(`account ${l.code} missing from chart of accounts`);
          return {
            journalId: h.id,
            lineNumber: i + 1,
            accountId,
            divisionId: l.division ? div.get(l.division) : undefined,
            debit: l.debit ?? '0',
            credit: l.credit ?? '0',
            currencyCode: 'EUR',
            description: l.text ?? description,
          };
        }),
      );
      return h;
    });
  }

  const jInvoice = await journal(`Invoice ${paidInvoice.invoiceNumber} — Finfix ${tag}`, [
    { code: '1100', debit: '1230.00', division: 'recruitment' },
    { code: '4200', credit: '1000.00', division: 'recruitment' },
    { code: '2100', credit: '230.00', division: 'recruitment' },
  ]);
  await journal(`Receipt ${paidInvoice.receiptNumber} — Finfix ${tag}`, [
    { code: '1010', debit: '1230.00' },
    { code: '1100', credit: '1230.00' },
  ]);
  const jBill = await journal(`Bill ${billOpen.number} — ${supplier.legalName}`, [
    { code: '6300', debit: '500.00' },
    { code: '1050', debit: '115.00' },
    { code: '2000', credit: '615.00' },
  ]);
  await journal(`Payment on bill ${billPart.number}`, [
    { code: '2000', debit: '600.00' },
    { code: '1010', credit: '600.00' },
  ]);
  await journal(`Candidate Services sales — Finfix ${tag}`, [
    { code: '1010', debit: '450.00', division: 'candidate_services' },
    { code: '4100', credit: '450.00', division: 'candidate_services' },
  ]);
  const jWrong = await journal(`Rent accrual posted in error — Finfix ${tag}`, [
    { code: '6100', debit: '300.00' },
    { code: '1010', credit: '300.00' },
  ]);
  const jReversal = await journal(
    `Reversal of ${jWrong.number}: posted to the wrong period`,
    [
      { code: '1010', debit: '300.00' },
      { code: '6100', credit: '300.00' },
    ],
    jWrong.id,
  );
  await m.db
    .update(m.s.journals)
    .set({ status: 'REVERSED' })
    .where(m.eq(m.s.journals.id, jWrong.id));

  const tax = await m.db
    .insert(m.s.taxTransactions)
    .values([
      {
        transactionDate: isoDate(0),
        sourceType: 'finfix',
        sourceId: `finfix-${tag}-out`,
        journalId: jInvoice.id,
        direction: 'OUTPUT',
        taxCode: 'STANDARD',
        taxRatePercent: '23.00',
        netAmount: '1000.00',
        taxAmount: '230.00',
        currencyCode: 'EUR',
        divisionId: div.get('recruitment'),
        customerEmployerId: employer.id,
        description: `Invoice ${paidInvoice.invoiceNumber}`,
      },
      {
        transactionDate: isoDate(0),
        sourceType: 'finfix',
        sourceId: `finfix-${tag}-in`,
        journalId: jBill.id,
        direction: 'INPUT',
        taxCode: 'STANDARD',
        taxRatePercent: '23.00',
        netAmount: '500.00',
        taxAmount: '115.00',
        currencyCode: 'EUR',
        description: `Bill ${billOpen.number}`,
      },
    ])
    .returning({ id: m.s.taxTransactions.id });
  ids.taxTransactions.push(...tax.map((t) => t.id));

  // ── Existing records the scenario reuses (read-only) ────────────────
  const reuse = (await m.db.execute(m.sql`
    select pf.id, pf.number, pf.source_lead_id as lead, pf.payer_person_id as person
      from pro_forma_invoices pf
     where exists (select 1 from payments p where p.pro_forma_invoice_id = pf.id)
     order by (select count(*) from payments p where p.pro_forma_invoice_id = pf.id) desc,
              pf.created_at desc
     limit 1`)) as unknown as Array<{ id: string; number: string; lead: string; person: string }>;
  const candInv = (await m.db.execute(m.sql`
    select i.number, i.payer_person_id as person,
           (select r.number from receipts r where r.invoice_id = i.id order by r.issued_at desc limit 1) as receipt
      from invoices i
     where i.payer_person_id is not null and i.status = 'PAID'
       and exists (select 1 from receipts r where r.invoice_id = i.id)
     order by i.issued_at desc limit 1`)) as unknown as Array<{
    number: string;
    person: string;
    receipt: string;
  }>;
  const pf = reuse[0] ?? null;
  const ci = candInv[0] ?? null;

  const scenario = {
    tag,
    employerId: employer.id,
    employerName: `Finfix ${tag} Holdings Ltd`,
    supplierName: supplier.legalName,
    paidInvoice,
    partInvoice,
    bills: { open: billOpen, part: billPart, paid: billPaid },
    journals: { invoice: jInvoice, wrong: jWrong, reversal: jReversal },
    urls: {
      employerInvoice: `/employers/${employer.id}/invoices/${paidInvoice.invoiceNumber}`,
      employerPartInvoice: `/employers/${employer.id}/invoices/${partInvoice.invoiceNumber}`,
      employerReceipt: `/employers/${employer.id}/receipts/${paidInvoice.receiptNumber}`,
      billDetail: `/admin/accounting/ap/bills/${billPart.id}`,
      journalDetail: `/admin/accounting/journals/${jInvoice.id}`,
      reversedJournal: `/admin/accounting/journals/${jWrong.id}`,
      candidateInvoice: ci ? `/candidates/${ci.person}/invoices/${ci.number}` : null,
      candidateReceipt: ci?.receipt ? `/candidates/${ci.person}/receipts/${ci.receipt}` : null,
      proForma: pf ? `/leads/${pf.lead}/pro-formas/${pf.id}` : null,
      proFormaPrint: pf ? `/leads/${pf.lead}/pro-formas/${pf.id}/print` : null,
      createProForma: pf ? `/clients/${pf.person}/create-pro-forma` : null,
    },
    reused: { proFormaNumber: pf?.number ?? null, candidateInvoiceNumber: ci?.number ?? null },
    createdPeriod: ids.periods.length > 0,
    ids,
  };

  async function remaining() {
    const count = async (table: string, list: string[]) => {
      const r = (await m.db.execute(
        m.sql`select count(*)::int as n from ${m.sql.identifier(table)} where id in (${m.sql.join(
          (list.length ? list : [NONE]).map((i) => m.sql`${i}`),
          m.sql`, `,
        )})`,
      )) as unknown as Array<{ n: number }>;
      return r[0]?.n ?? 0;
    };
    return {
      employers: await count('employers', ids.employers),
      engagements: await count('service_engagements', ids.engagements),
      invoices: await count('invoices', ids.invoices),
      payments: await count('payments', ids.payments),
      receipts: await count('receipts', ids.receipts),
      suppliers: await count('suppliers', ids.suppliers),
      bills: await count('supplier_bills', ids.bills),
      billPayments: await count('bill_payments', ids.billPayments),
      journals: await count('journals', ids.journals),
      taxTransactions: await count('tax_transactions', ids.taxTransactions),
      periods: await count('accounting_periods', ids.periods),
    };
  }

  async function cleanup() {
    const list = (xs: string[]) => (xs.length ? xs : [NONE]);
    await m.db.transaction(async (tx) => {
      await tx
        .delete(m.s.taxTransactions)
        .where(m.inArray(m.s.taxTransactions.id, list(ids.taxTransactions)));
      // Removing every line of a journal leaves it balanced (0 = 0) for the
      // deferred balance trigger; DELETE is not blocked by immutability.
      await tx
        .delete(m.s.journalLines)
        .where(m.inArray(m.s.journalLines.journalId, list(ids.journals)));
      await tx.delete(m.s.journals).where(m.inArray(m.s.journals.id, list(ids.journals)));
      if (ids.periods.length) {
        // Only the period this fixture created, and only if nothing else
        // posted into it meanwhile.
        await tx.execute(m.sql`
          delete from accounting_periods
           where id in (${m.sql.join(
             ids.periods.map((i) => m.sql`${i}`),
             m.sql`, `,
           )})
             and not exists (select 1 from journals j where j.period_id = accounting_periods.id)`);
      }
      await tx
        .delete(m.s.billPayments)
        .where(m.inArray(m.s.billPayments.id, list(ids.billPayments)));
      await tx.delete(m.s.supplierBills).where(m.inArray(m.s.supplierBills.id, list(ids.bills)));
      await tx.delete(m.s.suppliers).where(m.inArray(m.s.suppliers.id, list(ids.suppliers)));
      await tx.delete(m.s.receipts).where(m.inArray(m.s.receipts.id, list(ids.receipts)));
      await tx.delete(m.s.payments).where(m.inArray(m.s.payments.id, list(ids.payments)));
      await tx.delete(m.s.invoices).where(m.inArray(m.s.invoices.id, list(ids.invoices)));
      await tx
        .delete(m.s.serviceEngagements)
        .where(m.inArray(m.s.serviceEngagements.id, list(ids.engagements)));
      // Any audit rows a page visit may have written about these records.
      const all = [
        ...ids.employers,
        ...ids.invoices,
        ...ids.bills,
        ...ids.suppliers,
        ...ids.journals,
      ];
      await tx.execute(
        m.sql`delete from audit_events where entity_id in (${m.sql.join(
          list(all).map((i) => m.sql`${i}`),
          m.sql`, `,
        )})`,
      );
      await tx.delete(m.s.employers).where(m.inArray(m.s.employers.id, list(ids.employers)));
    });
  }

  return { ...scenario, cleanup, remaining };
}

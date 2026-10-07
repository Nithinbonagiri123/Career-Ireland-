import { desc, eq, sql } from 'drizzle-orm';
import { recordAudit } from '@/lib/audit/withAudit';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import {
  type BillPayment,
  billPayments,
  type Supplier,
  type SupplierBill,
  supplierBills,
  suppliers,
} from '@/lib/db/schema/ap';
import { documentSequences } from '@/lib/db/schema/billing';
import { BusinessRuleError, ValidationError } from '@/lib/errors';
import { emitFinancialEvent } from '@/modules/accounting/events';
import {
  type CreateBillInput,
  CreateBillSchema,
  type CreateSupplierInput,
  CreateSupplierSchema,
  type RecordBillPaymentInput,
  RecordBillPaymentSchema,
  type UpdateSupplierInput,
  UpdateSupplierSchema,
} from './schemas';

// Re-export so callers that imported these from ./service keep working.
export {
  type CreateBillInput,
  CreateBillSchema,
  type CreateSupplierInput,
  CreateSupplierSchema,
  proRateCreditTax,
  type RecordBillPaymentInput,
  RecordBillPaymentSchema,
  type UpdateSupplierInput,
  UpdateSupplierSchema,
} from './schemas';

import { proRateCreditTax } from './schemas';

void proRateCreditTax;

/**
 * Accounts Payable service layer. Three objects:
 *   - Supplier     — the vendor master record
 *   - Supplier bill — a vendor's invoice to us (DR Expense / CR AP)
 *   - Bill payment  — us paying a bill (DR AP / CR Bank)
 *
 * Events emitted:
 *   SUPPLIER_BILL_POSTED      — on bill insert
 *   SUPPLIER_PAYMENT_SENT     — on payment insert
 *
 * Both carry the expense account code in payload so the outbox drainer
 * can resolve a bill-specific DR account rather than a static rule.
 */

// ─── Supplier master ───────────────────────────────────────────────

export async function createSupplier(input: CreateSupplierInput): Promise<Supplier> {
  const session = await requireRole(['ADMIN', 'FINANCE', 'MANAGER']);
  const parsed = CreateSupplierSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid supplier input',
      parsed.error.flatten().fieldErrors as Record<string, string>,
    );
  }
  const d = parsed.data;
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(suppliers)
      .values({
        legalName: d.legalName,
        tradingName: d.tradingName || null,
        email: d.email || null,
        phone: d.phone || null,
        address: d.address || null,
        taxNumber: d.taxNumber || null,
        country: d.country || null,
        currencyCode: d.currencyCode || null,
        paymentTermsDays: d.paymentTermsDays,
        notes: d.notes || null,
      })
      .returning();
    if (!row) throw new Error('suppliers insert returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'supplier',
      entityId: row.id,
      action: 'CREATED',
      after: { legalName: row.legalName, currencyCode: row.currencyCode },
    });
    return row;
  });
}

export async function updateSupplier(input: UpdateSupplierInput): Promise<Supplier> {
  const session = await requireRole(['ADMIN', 'FINANCE', 'MANAGER']);
  const parsed = UpdateSupplierSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid supplier update',
      parsed.error.flatten().fieldErrors as Record<string, string>,
    );
  }
  const { id, ...patch } = parsed.data;
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(suppliers).where(eq(suppliers.id, id)).limit(1);
    if (!before) throw new BusinessRuleError('SUPPLIER_NOT_FOUND', 'Supplier not found');
    const [row] = await tx
      .update(suppliers)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(suppliers.id, id))
      .returning();
    if (!row) throw new Error('suppliers update returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'supplier',
      entityId: id,
      action: 'UPDATED',
      before: { isActive: before.isActive, legalName: before.legalName },
      after: { isActive: row.isActive, legalName: row.legalName },
    });
    return row;
  });
}

// ─── Supplier bills ────────────────────────────────────────────────

export async function createSupplierBill(input: CreateBillInput): Promise<SupplierBill> {
  const session = await requireRole(['ADMIN', 'FINANCE']);
  const parsed = CreateBillSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid bill input',
      parsed.error.flatten().fieldErrors as Record<string, string>,
    );
  }
  const d = parsed.data;
  const subtotalCents = Math.round(Number.parseFloat(d.subtotal) * 100);
  const taxCents = Math.round(Number.parseFloat(d.taxAmount) * 100);
  const totalCents = subtotalCents + taxCents;
  if (subtotalCents < 0) throw new ValidationError('Subtotal must be non-negative', {});

  return db.transaction(async (tx) => {
    const [supplier] = await tx
      .select()
      .from(suppliers)
      .where(eq(suppliers.id, d.supplierId))
      .limit(1);
    if (!supplier)
      throw new BusinessRuleError('SUPPLIER_NOT_FOUND', `Supplier ${d.supplierId} not found`);
    if (!supplier.isActive)
      throw new BusinessRuleError(
        'SUPPLIER_INACTIVE',
        `Supplier ${supplier.legalName} is inactive`,
      );

    const year = new Date(d.billDate).getUTCFullYear();
    const [seqRow] = await tx
      .insert(documentSequences)
      .values({ prefix: 'BILL', year, currentValue: 1 })
      .onConflictDoUpdate({
        target: [documentSequences.prefix, documentSequences.year],
        set: {
          currentValue: sql`${documentSequences.currentValue} + 1`,
          updatedAt: sql`NOW()`,
        },
      })
      .returning({ currentValue: documentSequences.currentValue });
    if (!seqRow) throw new Error('document_sequences upsert returned no row');
    const number = `BILL-${year}-${String(seqRow.currentValue).padStart(6, '0')}`;

    const [row] = await tx
      .insert(supplierBills)
      .values({
        number,
        supplierId: d.supplierId,
        supplierReference: d.supplierReference || null,
        billDate: d.billDate,
        dueDate: d.dueDate,
        currencyCode: d.currencyCode,
        subtotal: (subtotalCents / 100).toFixed(2),
        taxAmount: (taxCents / 100).toFixed(2),
        totalAmount: (totalCents / 100).toFixed(2),
        expenseAccountCode: d.expenseAccountCode,
        description: d.description,
        status: 'POSTED',
        createdByUserId: session.user.id,
      })
      .returning();
    if (!row) throw new Error('supplier_bills insert returned no row');

    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'supplier_bill',
      entityId: row.id,
      action: 'POSTED',
      after: {
        number: row.number,
        supplierId: row.supplierId,
        total: row.totalAmount,
        currency: row.currencyCode,
      },
    });

    // Shadow-record into the ledger. The outbox-drain reads
    // `payload.principalDebitAccountCode` to send the DR side to the
    // bill-specific expense account; the rule's debit account acts as
    // a fallback only.
    await emitFinancialEvent(tx, {
      eventType: 'SUPPLIER_BILL_POSTED',
      sourceSystem: 'ireland_careers',
      sourceModule: 'ap',
      sourceEntity: 'supplier_bill',
      sourceId: row.id,
      sourceEventId: row.id,
      eventDate: new Date(d.billDate),
      payload: {
        actorUserId: session.user.id,
        billNumber: row.number,
        supplierId: row.supplierId,
        principalDebitAccountCode: d.expenseAccountCode,
        currencyCode: d.currencyCode,
        subtotal: (subtotalCents / 100).toFixed(2),
        taxAmount: (taxCents / 100).toFixed(2),
        total: (totalCents / 100).toFixed(2),
        description: `Bill ${row.number} from ${supplier.legalName}`,
      },
    });

    return row;
  });
}

export async function voidSupplierBill(input: {
  billId: string;
  reason: string;
}): Promise<SupplierBill> {
  const session = await requireRole(['ADMIN', 'FINANCE']);
  if (!input.reason || input.reason.trim().length < 3)
    throw new ValidationError('Reason required for void', { reason: 'required' });
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(supplierBills)
      .where(eq(supplierBills.id, input.billId))
      .for('update')
      .limit(1);
    if (!before) throw new BusinessRuleError('BILL_NOT_FOUND', 'Bill not found');
    if (before.status === 'VOID') return before;
    if (before.status === 'PAID' || before.status === 'PARTIALLY_PAID')
      throw new BusinessRuleError(
        'BILL_NOT_VOIDABLE',
        `Bill is ${before.status}; use a reversal journal instead`,
      );
    const [row] = await tx
      .update(supplierBills)
      .set({ status: 'VOID', voidedAt: new Date(), voidReason: input.reason.trim() })
      .where(eq(supplierBills.id, input.billId))
      .returning();
    if (!row) throw new Error('supplier_bills update returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'supplier_bill',
      entityId: input.billId,
      action: 'VOIDED',
      before: { status: before.status },
      after: { status: row.status, voidReason: row.voidReason },
    });
    return row;
  });
}

// ─── Bill payments ─────────────────────────────────────────────────

export async function recordBillPayment(input: RecordBillPaymentInput): Promise<BillPayment> {
  const session = await requireRole(['ADMIN', 'FINANCE']);
  const parsed = RecordBillPaymentSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid bill-payment input',
      parsed.error.flatten().fieldErrors as Record<string, string>,
    );
  }
  const d = parsed.data;
  const amountCents = Math.round(Number.parseFloat(d.amount) * 100);
  if (amountCents <= 0)
    throw new ValidationError('Amount must be positive', { amount: 'required' });

  return db.transaction(async (tx) => {
    const [bill] = await tx
      .select()
      .from(supplierBills)
      .where(eq(supplierBills.id, d.billId))
      .for('update')
      .limit(1);
    if (!bill) throw new BusinessRuleError('BILL_NOT_FOUND', 'Bill not found');
    if (bill.status === 'VOID')
      throw new BusinessRuleError('BILL_VOID', 'Cannot pay a voided bill');
    if (bill.status === 'PAID')
      throw new BusinessRuleError('BILL_ALREADY_PAID', 'Bill is already fully paid');

    const totalCents = Math.round(Number.parseFloat(bill.totalAmount) * 100);
    const [{ paid }] = await tx
      .select({ paid: sql<string>`COALESCE(SUM(${billPayments.amount}), 0)::text` })
      .from(billPayments)
      .where(eq(billPayments.billId, d.billId));
    const alreadyPaidCents = Math.round(Number.parseFloat(paid) * 100);
    if (alreadyPaidCents + amountCents > totalCents) {
      throw new BusinessRuleError(
        'OVERPAYMENT',
        `Payment would overpay the bill (bill total ${(totalCents / 100).toFixed(2)}, already paid ${(alreadyPaidCents / 100).toFixed(2)}, this ${(amountCents / 100).toFixed(2)})`,
      );
    }

    const [row] = await tx
      .insert(billPayments)
      .values({
        billId: d.billId,
        paymentDate: d.paymentDate,
        amount: d.amount,
        currencyCode: bill.currencyCode,
        method: d.method,
        reference: d.reference || null,
        createdByUserId: session.user.id,
      })
      .returning();
    if (!row) throw new Error('bill_payments insert returned no row');

    // Flip bill status based on the new paid total.
    const newPaidCents = alreadyPaidCents + amountCents;
    const nextStatus: SupplierBill['status'] =
      newPaidCents >= totalCents ? 'PAID' : 'PARTIALLY_PAID';
    if (nextStatus !== bill.status) {
      await tx
        .update(supplierBills)
        .set({ status: nextStatus, updatedAt: new Date() })
        .where(eq(supplierBills.id, d.billId));
      await recordAudit(tx, {
        actorUserId: session.user.id,
        entityType: 'supplier_bill',
        entityId: d.billId,
        action: 'STATUS_CHANGED',
        before: { status: bill.status },
        after: { status: nextStatus },
        context: { via: 'bill_payment', paymentId: row.id },
      });
    }

    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'bill_payment',
      entityId: row.id,
      action: 'CREATED',
      after: { billId: d.billId, amount: d.amount, method: d.method },
    });

    // Shadow-record. Division is null (expenses tend to be cross-
    // divisional; a future enhancement maps bill → division via the
    // expense account's cost center).
    await emitFinancialEvent(tx, {
      eventType: 'SUPPLIER_PAYMENT_SENT',
      sourceSystem: 'ireland_careers',
      sourceModule: 'ap',
      sourceEntity: 'bill_payment',
      sourceId: row.id,
      sourceEventId: row.id,
      eventDate: new Date(d.paymentDate),
      payload: {
        actorUserId: session.user.id,
        billId: d.billId,
        billNumber: bill.number,
        currencyCode: bill.currencyCode,
        subtotal: d.amount,
        taxAmount: '0',
        total: d.amount,
        description: `Payment of ${d.amount} ${bill.currencyCode} on bill ${bill.number}`,
      },
    });

    return row;
  });
}

export async function listSuppliers(): Promise<Supplier[]> {
  return db.select().from(suppliers).orderBy(desc(suppliers.isActive), suppliers.legalName);
}

export async function listSupplierBills(opts?: {
  supplierId?: string;
}): Promise<Array<SupplierBill & { supplierName: string; paidAmount: string }>> {
  const rows = await db
    .select({
      bill: supplierBills,
      supplierName: suppliers.legalName,
      paidAmount: sql<string>`COALESCE((SELECT SUM(${billPayments.amount}) FROM ${billPayments} WHERE ${billPayments.billId} = ${supplierBills.id}), 0)::text`,
    })
    .from(supplierBills)
    .innerJoin(suppliers, eq(suppliers.id, supplierBills.supplierId))
    .where(opts?.supplierId ? eq(supplierBills.supplierId, opts.supplierId) : undefined)
    .orderBy(desc(supplierBills.billDate), desc(supplierBills.number));
  return rows.map((r) => ({ ...r.bill, supplierName: r.supplierName, paidAmount: r.paidAmount }));
}

export async function fetchBillDetail(billId: string): Promise<{
  bill: SupplierBill & { supplierName: string };
  payments: BillPayment[];
} | null> {
  const [row] = await db
    .select({
      bill: supplierBills,
      supplierName: suppliers.legalName,
    })
    .from(supplierBills)
    .innerJoin(suppliers, eq(suppliers.id, supplierBills.supplierId))
    .where(eq(supplierBills.id, billId))
    .limit(1);
  if (!row) return null;
  const payments = await db
    .select()
    .from(billPayments)
    .where(eq(billPayments.billId, billId))
    .orderBy(desc(billPayments.paymentDate));
  return { bill: { ...row.bill, supplierName: row.supplierName }, payments };
}

/**
 * AP aging report: outstanding bills grouped by days-overdue bucket.
 * Mirrors the AR aging shape so finance can see both sides of working
 * capital in the same vocabulary.
 */
export type ApAgingBucket = {
  label: string;
  dayMin: number;
  dayMax: number | null;
  currencyCode: string;
  outstandingAmount: string;
  billCount: number;
};

export async function fetchApAging(asOf: Date = new Date()): Promise<ApAgingBucket[]> {
  const asOfStr = asOf.toISOString().slice(0, 10);
  const rows = await db.execute<{
    bucket: string;
    currency_code: string;
    outstanding: string;
    bill_count: string;
  }>(sql`
    SELECT
      CASE
        WHEN ${supplierBills.dueDate} >= ${asOfStr}::date THEN 'current'
        WHEN ${asOfStr}::date - ${supplierBills.dueDate} BETWEEN 1 AND 30 THEN '1_30'
        WHEN ${asOfStr}::date - ${supplierBills.dueDate} BETWEEN 31 AND 60 THEN '31_60'
        WHEN ${asOfStr}::date - ${supplierBills.dueDate} BETWEEN 61 AND 90 THEN '61_90'
        ELSE 'over_90'
      END AS bucket,
      ${supplierBills.currencyCode} AS currency_code,
      SUM(
        ${supplierBills.totalAmount}::numeric
          - COALESCE((
              SELECT SUM(amount) FROM ${billPayments}
              WHERE ${billPayments.billId} = ${supplierBills.id}
            ), 0)
      )::text AS outstanding,
      COUNT(*)::text AS bill_count
    FROM ${supplierBills}
    WHERE ${supplierBills.status} IN ('POSTED','PARTIALLY_PAID')
    GROUP BY bucket, ${supplierBills.currencyCode}
    HAVING SUM(
      ${supplierBills.totalAmount}::numeric
        - COALESCE((
            SELECT SUM(amount) FROM ${billPayments}
            WHERE ${billPayments.billId} = ${supplierBills.id}
          ), 0)
    ) > 0
  `);

  const bucketMeta: Record<string, { label: string; dayMin: number; dayMax: number | null }> = {
    current: { label: 'Current', dayMin: 0, dayMax: 0 },
    '1_30': { label: '1–30 days overdue', dayMin: 1, dayMax: 30 },
    '31_60': { label: '31–60 days overdue', dayMin: 31, dayMax: 60 },
    '61_90': { label: '61–90 days overdue', dayMin: 61, dayMax: 90 },
    over_90: { label: '90+ days overdue', dayMin: 91, dayMax: null },
  };
  return rows.map((r) => {
    const meta = bucketMeta[r.bucket] ?? { label: r.bucket, dayMin: 0, dayMax: null };
    return {
      label: meta.label,
      dayMin: meta.dayMin,
      dayMax: meta.dayMax,
      currencyCode: r.currency_code,
      outstandingAmount: r.outstanding,
      billCount: Number.parseInt(r.bill_count, 10),
    };
  });
}

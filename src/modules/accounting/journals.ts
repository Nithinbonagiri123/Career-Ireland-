import { eq, sql } from 'drizzle-orm';
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
 * Service layer for the double-entry ledger (Phase 1 scope).
 *
 * Exposes `postManualJournal` — the admin-only "post a balanced journal
 * by hand" entry point. The Phase 2 event→journal worker will land
 * alongside this but is deliberately NOT in Phase 1; see
 * docs/accounting-ledger-design.md.
 *
 * House rules enforced here (duplicated at the DB layer via CHECKs +
 * triggers so a direct SQL insert from a notebook can't break them):
 *   - every journal has at least two lines
 *   - sum(debit) === sum(credit) across all lines
 *   - each line is either a debit or a credit, never both
 *   - amounts are stored as string decimals ("1230.00"), never floats
 *   - target account must exist, be active, and allow_posting = true
 *   - target division (optional) must exist
 *   - final insert is wrapped in a transaction; the deferred balance
 *     trigger fires at commit, so the whole post rolls back if the
 *     numbers don't tie — the service-layer check above is a
 *     fast-fail so the client gets a clear error without a round-trip
 *     to the DB
 */

export const PostManualJournalLineSchema = z
  .object({
    accountCode: z.string().min(1).max(10),
    divisionCode: z.string().min(1).max(40).optional(),
    debit: z.string().regex(/^\d+(\.\d{1,2})?$/, 'debit must be a decimal with up to 2 dp'),
    credit: z.string().regex(/^\d+(\.\d{1,2})?$/, 'credit must be a decimal with up to 2 dp'),
    description: z.string().max(500).optional(),
  })
  .refine(
    (l) => (l.debit === '0' || l.debit === '0.00') !== (l.credit === '0' || l.credit === '0.00'),
    { message: 'each line must be either a debit or a credit, not both' },
  );

export const PostManualJournalSchema = z
  .object({
    journalDate: z.date(),
    description: z.string().min(1).max(500),
    transactionCurrency: z
      .string()
      .length(3)
      .regex(/^[A-Z]{3}$/, 'currency code must be 3 uppercase letters'),
    lines: z.array(PostManualJournalLineSchema).min(2, 'a journal needs at least two lines'),
  })
  .refine(
    (j) => {
      const d = j.lines.reduce((s, l) => s + Math.round(parseFloat(l.debit) * 100), 0);
      const c = j.lines.reduce((s, l) => s + Math.round(parseFloat(l.credit) * 100), 0);
      return d === c;
    },
    { message: 'journal is unbalanced — sum(debit) must equal sum(credit)' },
  );

export type PostManualJournalInput = z.infer<typeof PostManualJournalSchema>;

/**
 * Post an admin-authored balanced journal. ADMIN + FINANCE only. Writes
 * the journal + all lines inside one transaction so the DB-level
 * balance trigger either accepts the whole thing or rolls it all back.
 */
export async function postManualJournal(input: PostManualJournalInput): Promise<Journal> {
  const session = await requireRole(['ADMIN', 'FINANCE']);
  const parsed = PostManualJournalSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid manual journal input',
      parsed.error.flatten().fieldErrors as Record<string, string>,
    );
  }
  const data = parsed.data;

  return db.transaction(async (tx) => {
    const period = await getOrCreatePeriodForDate(tx, data.journalDate);

    // Resolve account codes → ids (and validate posting is allowed).
    const codes = Array.from(new Set(data.lines.map((l) => l.accountCode)));
    const accounts = await tx
      .select({
        id: chartOfAccounts.id,
        code: chartOfAccounts.code,
        allowPosting: chartOfAccounts.allowPosting,
        active: chartOfAccounts.active,
      })
      .from(chartOfAccounts);
    const accountByCode = new Map(accounts.filter((a) => codes.includes(a.code)).map((a) => [a.code, a]));
    for (const code of codes) {
      const row = accountByCode.get(code);
      if (!row)
        throw new BusinessRuleError('ACCOUNT_NOT_FOUND', `unknown account code "${code}"`);
      if (!row.active)
        throw new BusinessRuleError('ACCOUNT_INACTIVE', `account "${code}" is inactive`);
      if (!row.allowPosting)
        throw new BusinessRuleError(
          'ACCOUNT_NO_POST',
          `account "${code}" is a parent / summary account and does not allow posting`,
        );
    }

    // Resolve optional division codes → ids. Division is nullable per
    // line, but if given it must exist.
    const divisionCodes = Array.from(
      new Set(data.lines.map((l) => l.divisionCode).filter((c): c is string => Boolean(c))),
    );
    const divisionByCode = new Map<string, string>();
    if (divisionCodes.length > 0) {
      const rows = await tx
        .select({ id: businessDivisions.id, code: businessDivisions.code })
        .from(businessDivisions);
      for (const row of rows) divisionByCode.set(row.code, row.id);
      for (const code of divisionCodes) {
        if (!divisionByCode.has(code))
          throw new BusinessRuleError('DIVISION_NOT_FOUND', `unknown business division "${code}"`);
      }
    }

    // Allocate journal number. Shares the document_sequences table with
    // invoices/receipts/credit-notes so there is one atomic numbering
    // mechanism for the whole app.
    const year = data.journalDate.getUTCFullYear();
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

    // Insert the journal header + all lines. The deferred balance
    // trigger fires at COMMIT; any mismatch rolls the whole tx back.
    const [header] = await tx
      .insert(journals)
      .values({
        number: journalNumber,
        journalDate: data.journalDate.toISOString().slice(0, 10),
        postingDate: new Date().toISOString().slice(0, 10),
        periodId: period.id,
        transactionCurrency: data.transactionCurrency,
        functionalCurrency: 'EUR',
        exchangeRate: '1',
        description: data.description,
        status: 'POSTED',
        createdByUserId: session.user.id,
        postedByUserId: session.user.id,
        postedAt: new Date(),
      })
      .returning();
    if (!header) throw new Error('journals insert returned no row');

    await tx.insert(journalLines).values(
      data.lines.map((l, i) => ({
        journalId: header.id,
        lineNumber: i + 1,
        accountId: accountByCode.get(l.accountCode)!.id,
        divisionId: l.divisionCode ? divisionByCode.get(l.divisionCode) : undefined,
        debit: l.debit,
        credit: l.credit,
        currencyCode: data.transactionCurrency,
        description: l.description,
      })),
    );

    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'journal',
      entityId: header.id,
      action: 'POST',
      after: { number: journalNumber, lineCount: data.lines.length },
    });

    return header;
  });
}

/**
 * Reverse a POSTED journal by creating a new journal with the same
 * lines, debits and credits swapped, linked via `reverses_journal_id`.
 * The original row has its status flipped POSTED → REVERSED (the single
 * UPDATE the DB-level immutability trigger allows).
 *
 * ADMIN + FINANCE only. Reason is recorded on the audit event and in
 * the new journal's description for traceability.
 */
export async function reverseJournal(input: {
  journalId: string;
  reason: string;
}): Promise<Journal> {
  const session = await requireRole(['ADMIN', 'FINANCE']);
  if (!input.reason || input.reason.trim().length < 3)
    throw new ValidationError('reason is required for reversal', { reason: 'required' });

  return db.transaction(async (tx) => {
    const [original] = await tx
      .select()
      .from(journals)
      .where(eq(journals.id, input.journalId))
      .limit(1);
    if (!original)
      throw new BusinessRuleError('JOURNAL_NOT_FOUND', `journal ${input.journalId} not found`);
    if (original.status !== 'POSTED')
      throw new BusinessRuleError(
        'JOURNAL_NOT_POSTED',
        `only POSTED journals can be reversed (current: ${original.status})`,
      );

    const originalLines = await tx
      .select()
      .from(journalLines)
      .where(eq(journalLines.journalId, original.id));

    const period = await getOrCreatePeriodForDate(tx, new Date());
    const year = new Date().getUTCFullYear();
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
    const reversalNumber = `JRN-${year}-${String(seqRow.currentValue).padStart(6, '0')}`;

    const [reversal] = await tx
      .insert(journals)
      .values({
        number: reversalNumber,
        journalDate: new Date().toISOString().slice(0, 10),
        postingDate: new Date().toISOString().slice(0, 10),
        periodId: period.id,
        transactionCurrency: original.transactionCurrency,
        functionalCurrency: original.functionalCurrency,
        exchangeRate: original.exchangeRate,
        description: `Reversal of ${original.number}: ${input.reason}`,
        status: 'POSTED',
        createdByUserId: session.user.id,
        postedByUserId: session.user.id,
        postedAt: new Date(),
        reversesJournalId: original.id,
      })
      .returning();
    if (!reversal) throw new Error('reversal journal insert returned no row');

    await tx.insert(journalLines).values(
      originalLines.map((l, i) => ({
        journalId: reversal.id,
        lineNumber: i + 1,
        accountId: l.accountId,
        divisionId: l.divisionId ?? undefined,
        // Flip debit <-> credit — this is what makes the reversal cancel
        // the original.
        debit: l.credit,
        credit: l.debit,
        foreignDebit: l.foreignCredit,
        foreignCredit: l.foreignDebit,
        currencyCode: l.currencyCode,
        customerPersonId: l.customerPersonId ?? undefined,
        customerEmployerId: l.customerEmployerId ?? undefined,
        serviceEngagementId: l.serviceEngagementId ?? undefined,
        taxCode: l.taxCode ?? undefined,
        description: l.description ?? undefined,
      })),
    );

    // Flip the original to REVERSED — the only UPDATE the DB-level
    // immutability trigger allows on a POSTED journal.
    await tx
      .update(journals)
      .set({ status: 'REVERSED' })
      .where(eq(journals.id, original.id));

    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'journal',
      entityId: original.id,
      action: 'REVERSE',
      before: { status: 'POSTED' },
      after: { status: 'REVERSED', reversalJournalId: reversal.id, reason: input.reason },
    });

    return reversal;
  });
}

import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { financialEvents, journalLines, journals } from '@/lib/db/schema/accounting';
import { documentSequences } from '@/lib/db/schema/billing';
import { logger } from '@/lib/logger';
import { getOrCreatePeriodForDate } from './periods';
import { resolveRulesForEvent } from './rule-engine';

/**
 * Drain pending financial events into balanced journals.
 *
 * How it works per event:
 *   1. Pull a batch of status='RECEIVED' rows with `FOR UPDATE SKIP
 *      LOCKED`, so two concurrent cron workers can run safely.
 *   2. Resolve the applicable accounting_rules for the event's
 *      (event_type, division, currency, event_date) tuple.
 *   3. Build a balanced journal: PRINCIPAL + optional TAX line, with
 *      debits and credits derived from the event's payload amounts.
 *   4. Insert the journal + lines in the same tx the event's status
 *      flip happens in — if the balance trigger rejects the journal,
 *      the event flips back to FAILED and the DB rolls both back.
 *
 * Not idempotent at the drain level — idempotency lives at the EMIT
 * site via `financial_events (source_system, source_event_id)` UNIQUE.
 * The drain assumes each row it claims is unique.
 */

const BATCH_SIZE = 25;

export type DrainResult = {
  claimed: number;
  processed: number;
  failed: number;
  errors: Array<{ eventId: string; error: string }>;
};

export async function drainFinancialEvents(): Promise<DrainResult> {
  // Phase A: claim a batch atomically. We flip RECEIVED → PROCESSING
  // under FOR UPDATE SKIP LOCKED so a second cron invocation picks a
  // different batch rather than contending on the same rows.
  const claimed = await db.transaction(async (tx) => {
    const rows = await tx.execute<{ id: string }>(
      sql`
        WITH to_claim AS (
          SELECT id FROM ${financialEvents}
          WHERE status = 'RECEIVED'
          ORDER BY received_at ASC
          LIMIT ${BATCH_SIZE}
          FOR UPDATE SKIP LOCKED
        )
        UPDATE ${financialEvents}
        SET status = 'PROCESSING', attempt_count = attempt_count + 1
        WHERE id IN (SELECT id FROM to_claim)
        RETURNING id
      `,
    );
    return rows.map((r) => r.id);
  });

  const result: DrainResult = {
    claimed: claimed.length,
    processed: 0,
    failed: 0,
    errors: [],
  };

  // Phase B: process each claimed row in its own transaction so a
  // single failure doesn't abort the batch. Partial-batch commits are
  // fine — nothing shares state between events.
  for (const id of claimed) {
    try {
      await processOne(id);
      result.processed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.failed++;
      result.errors.push({ eventId: id, error: msg });
      await db
        .update(financialEvents)
        .set({ status: 'FAILED', lastError: msg })
        .where(eq(financialEvents.id, id));
      logger.error({ eventId: id, err }, 'outbox-drain: event failed');
    }
  }

  if (result.claimed > 0) {
    logger.info(
      { claimed: result.claimed, processed: result.processed, failed: result.failed },
      'outbox-drain batch',
    );
  }
  return result;
}

/**
 * Process a single claimed event. Expects the event to already be in
 * PROCESSING status (claim phase above). On success flips to PROCESSED
 * with the journal id; on failure throws so the caller can flip to
 * FAILED with the error message.
 */
async function processOne(eventId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [event] = await tx.select().from(financialEvents).where(eq(financialEvents.id, eventId));
    if (!event) throw new Error(`event ${eventId} not found inside tx`);
    if (event.status !== 'PROCESSING')
      throw new Error(`event ${eventId} is ${event.status}, expected PROCESSING`);

    const payload = event.payload as EventPayload;
    const eventDate = new Date(event.eventDate);
    const rules = await resolveRulesForEvent(tx, {
      eventType: event.eventType,
      divisionCode: payload.divisionCode ?? null,
      currencyCode: payload.currencyCode,
      eventDate,
    });

    if (rules.length === 0) {
      throw new Error(
        `no accounting_rules match (event_type=${event.eventType}, division=${payload.divisionCode}, currency=${payload.currencyCode}, date=${event.eventDate})`,
      );
    }

    const period = await getOrCreatePeriodForDate(tx, eventDate);

    // Allocate a journal number. Shares the document_sequences table
    // with invoices/receipts/credit-notes.
    const year = eventDate.getUTCFullYear();
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

    // Build the journal header. created_by_user_id references the
    // event's actor; for Phase 2 we use payload.actorUserId when
    // present, else the special `__ledger_system` placeholder — we
    // insert that user via the seed script.
    //
    // Actually: for Phase 2 we require the EMIT caller to put the user
    // id into payload. If missing, we fail the event rather than
    // guessing — the admin dashboard surfaces the error for backfill.
    if (!payload.actorUserId) {
      throw new Error('event payload missing actorUserId');
    }

    const [header] = await tx
      .insert(journals)
      .values({
        number: journalNumber,
        journalDate: event.eventDate,
        postingDate: new Date().toISOString().slice(0, 10),
        periodId: period.id,
        transactionCurrency: payload.currencyCode,
        functionalCurrency: 'EUR',
        exchangeRate: '1',
        description: payload.description ?? `${event.eventType} ${event.sourceId}`,
        sourceType: event.eventType,
        sourceEventId: event.id,
        status: 'POSTED',
        createdByUserId: payload.actorUserId,
        postedByUserId: payload.actorUserId,
        postedAt: new Date(),
      })
      .returning();
    if (!header) throw new Error('journals insert returned no row');

    // Build the lines from the matched rules. PRINCIPAL covers the
    // net amount (subtotal); TAX covers tax (if any). Any role with a
    // zero amount is dropped so we don't insert useless 0 / 0 lines.
    type LineInput = {
      debitAccountId: string;
      creditAccountId: string;
      amountCents: number;
      description: string | null;
    };
    const lineInputs: LineInput[] = [];
    const principal = rules.find((r) => r.lineRole === 'PRINCIPAL');
    const tax = rules.find((r) => r.lineRole === 'TAX');
    const subtotalCents = Math.round(parseFloat(payload.subtotal) * 100);
    const taxCents = Math.round(parseFloat(payload.taxAmount ?? '0') * 100);

    if (principal && subtotalCents !== 0) {
      lineInputs.push({
        debitAccountId: principal.debitAccountId,
        creditAccountId: principal.creditAccountId,
        amountCents: Math.abs(subtotalCents),
        description: `${event.eventType} subtotal`,
      });
    }
    if (tax && taxCents !== 0) {
      lineInputs.push({
        debitAccountId: tax.debitAccountId,
        creditAccountId: tax.creditAccountId,
        amountCents: Math.abs(taxCents),
        description: `${event.eventType} tax`,
      });
    }
    if (lineInputs.length === 0) {
      throw new Error('no non-zero lines could be constructed from the rules');
    }

    // Each rule hits two accounts (debit + credit). For a POSITIVE
    // amount (e.g. INVOICE_POSTED subtotal), the debit account is
    // debited and the credit account is credited — straight-forward.
    // For a NEGATIVE amount (e.g. CREDIT_NOTE_POSTED), we flip the
    // sense: debit the credit-side, credit the debit-side. That's how
    // the mirrored reversal works without needing separate rules per
    // sign.
    const isNegative = subtotalCents < 0;
    const linesForDb: Array<typeof journalLines.$inferInsert> = [];
    let lineNumber = 1;
    for (const l of lineInputs) {
      const amount = (l.amountCents / 100).toFixed(2);
      const debitId = isNegative ? l.creditAccountId : l.debitAccountId;
      const creditId = isNegative ? l.debitAccountId : l.creditAccountId;
      linesForDb.push({
        journalId: header.id,
        lineNumber: lineNumber++,
        accountId: debitId,
        debit: amount,
        credit: '0',
        currencyCode: payload.currencyCode,
        description: l.description,
      });
      linesForDb.push({
        journalId: header.id,
        lineNumber: lineNumber++,
        accountId: creditId,
        debit: '0',
        credit: amount,
        currencyCode: payload.currencyCode,
        description: l.description,
      });
    }
    await tx.insert(journalLines).values(linesForDb);

    // Flip event → PROCESSED and back-link the journal id.
    await tx
      .update(financialEvents)
      .set({ status: 'PROCESSED', processedAt: new Date(), journalId: header.id, lastError: null })
      .where(and(eq(financialEvents.id, event.id), eq(financialEvents.status, 'PROCESSING')));
  });
}

/**
 * Payload shape every Phase 2 event is expected to carry. Not enforced
 * at the DB (jsonb is unstructured) but enforced here at the drain
 * site so missing fields surface as explicit event failures.
 */
type EventPayload = {
  divisionCode?: string;
  currencyCode: string;
  subtotal: string;
  taxAmount?: string;
  total?: string;
  description?: string;
  actorUserId: string;
  // Free-form additional fields (invoice number, payer id, etc.) —
  // ignored by the drain but useful for debugging in the admin UI.
  [k: string]: unknown;
};

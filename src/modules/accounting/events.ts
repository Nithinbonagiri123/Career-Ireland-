import { type DbExecutor } from '@/lib/audit/withAudit';
import { financialEvents } from '@/lib/db/schema/accounting';

/**
 * Emit a financial event onto the outbox so the ledger worker can pick
 * it up and turn it into a balanced journal (Phase 2).
 *
 * **Always call inside the caller's open transaction.** The whole point
 * of the outbox pattern is that the business change and the event row
 * commit atomically — if the business insert rolls back, so does the
 * event, which keeps the ledger from ever seeing an event for an
 * operational change that never happened.
 *
 * Idempotency: `(sourceSystem, sourceEventId)` is UNIQUE on the table.
 * `ON CONFLICT DO NOTHING` means duplicate emissions (worker retries,
 * webhook replays, deduplicated test fixtures) are safe no-ops that
 * return the existing row. The caller must pass a `sourceEventId` that
 * uniquely identifies the originating business change — typically the
 * target entity's own primary-key uuid (e.g. an invoice uuid), so that
 * every invoice insert maps to exactly one financial event.
 *
 * Returns the inserted-or-existing event row. `undefined` is never
 * returned — the conflict path still produces a row via RETURNING on
 * the SELECT fallback.
 */
export type EmitFinancialEventInput = {
  eventType: string;
  sourceSystem: string;
  sourceModule: string;
  sourceEntity: string;
  sourceId: string;
  sourceEventId: string;
  eventDate: Date;
  payload: Record<string, unknown>;
};

export async function emitFinancialEvent(
  tx: DbExecutor,
  input: EmitFinancialEventInput,
): Promise<void> {
  await tx
    .insert(financialEvents)
    .values({
      eventType: input.eventType,
      sourceSystem: input.sourceSystem,
      sourceModule: input.sourceModule,
      sourceEntity: input.sourceEntity,
      sourceId: input.sourceId,
      sourceEventId: input.sourceEventId,
      eventDate: input.eventDate.toISOString().slice(0, 10),
      payload: input.payload,
    })
    .onConflictDoNothing({
      target: [financialEvents.sourceSystem, financialEvents.sourceEventId],
    });
}

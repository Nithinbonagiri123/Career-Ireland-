import { and, eq, isNull, sql } from 'drizzle-orm';
import { type DbExecutor, recordAudit } from '@/lib/audit/withAudit';
import { db } from '@/lib/db/client';
import { leads } from '@/lib/db/schema/leads';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';

/**
 * Candidate Services lead expiry — Stage 4.
 *
 * Matches the design in docs/cs-lead-expiry-eligibility.md: a lead is
 * eligible for automatic expiry when it is a CS lead, still in NEW /
 * CONTACTED, >= 30 days old, and has no financial or operational
 * commitments. Protected cases are:
 *
 *   - converted / archived leads (status + timestamps)
 *   - leads with a live or won pro forma (DRAFT, ISSUED, ACCEPTED,
 *     CONVERTED)
 *   - leads whose payer person has an ACTIVE / PENDING engagement
 *   - leads whose attached payments are PENDING / VERIFIED
 *   - leads with an outstanding official invoice
 *
 * The job is idempotent: re-running it against the same set of leads
 * is a no-op because the status filter excludes already-EXPIRED rows.
 */

export const DEFAULT_EXPIRY_DAYS = 30;

/**
 * Return the IDs of CS leads eligible for expiry. Caller-friendly:
 * also accepts a custom `olderThanDays` so tests can hit the exact
 * 30-day boundary and the day-before (which must NOT be eligible).
 */
export async function fetchExpirableLeadIds(
  tx: DbExecutor,
  args?: { olderThanDays?: number; limit?: number },
): Promise<string[]> {
  const olderThanDays = args?.olderThanDays ?? DEFAULT_EXPIRY_DAYS;
  const limit = args?.limit ?? 500;
  const rows = await tx.execute<{ id: string }>(sql`
    SELECT l.id
    FROM leads l
    WHERE l.target_business = 'CANDIDATE_SERVICES'
      AND l.status IN ('NEW', 'CONTACTED')
      AND l.converted_at IS NULL
      AND l.archived_at IS NULL
      AND l.created_at < NOW() - (${olderThanDays}::text || ' days')::interval

      -- no live or won pro forma
      AND NOT EXISTS (
        SELECT 1 FROM pro_forma_invoices pf
        WHERE pf.source_lead_id = l.id
          AND pf.status IN ('DRAFT','ISSUED','ACCEPTED','CONVERTED')
      )

      -- no active engagement for this lead's person
      AND NOT EXISTS (
        SELECT 1 FROM service_engagements e
        WHERE e.payer_person_id = l.person_id
          AND e.status IN ('ACTIVE','PENDING_PAYMENT')
      )

      -- no verified or pending payment attached to any pro forma on this lead
      AND NOT EXISTS (
        SELECT 1
        FROM payments p
        JOIN pro_forma_invoices pf ON pf.id = p.pro_forma_invoice_id
        WHERE pf.source_lead_id = l.id
          AND p.status IN ('PENDING','VERIFIED')
      )

      -- no outstanding official invoice attached to this lead
      AND NOT EXISTS (
        SELECT 1 FROM invoices i
        WHERE i.source_lead_id = l.id
          AND i.status NOT IN ('VOIDED','PAID')
      )
    ORDER BY l.created_at
    LIMIT ${limit}
  `);
  return (rows as Array<{ id: string }>).map((r) => r.id);
}

/**
 * Expire a set of leads in a single transaction. Each row is re-locked
 * with `FOR UPDATE` and re-checked before being flipped so a payment
 * landing between the eligibility query and the writer is honoured.
 *
 * Returns the IDs that were actually flipped (eligibility can shrink
 * between the two reads). Idempotent — running against the same set
 * twice flips zero on the second pass because the status filter
 * excludes rows already in EXPIRED.
 */
export async function expireLeads(args?: {
  leadIds?: string[];
  olderThanDays?: number;
  actorUserId?: string | null;
}): Promise<{ expiredIds: string[]; skippedIds: string[] }> {
  const actorUserId = args?.actorUserId ?? null;
  return db.transaction(async (tx) => {
    const candidateIds =
      args?.leadIds ?? (await fetchExpirableLeadIds(tx, { olderThanDays: args?.olderThanDays }));
    const expiredIds: string[] = [];
    const skippedIds: string[] = [];
    for (const leadId of candidateIds) {
      // Re-lock + re-check inside the tx — the eligibility query may be
      // stale by milliseconds, and a payment landing in that window must
      // win over the automatic expiry.
      const [row] = await tx
        .select()
        .from(leads)
        .where(eq(leads.id, leadId))
        .for('update')
        .limit(1);
      if (!row || row.status === 'EXPIRED' || row.status === 'CONVERTED' || row.archivedAt) {
        skippedIds.push(leadId);
        continue;
      }
      const stillEligible = await fetchExpirableLeadIds(tx, {
        olderThanDays: args?.olderThanDays,
        limit: 1,
      });
      if (!stillEligible.includes(row.id)) {
        skippedIds.push(leadId);
        continue;
      }
      const now = new Date();
      const [updated] = await tx
        .update(leads)
        .set({
          status: 'EXPIRED',
          expiredAt: now,
          expiredByReason: 'auto_expiry_30d_inactive',
          updatedAt: now,
        })
        .where(and(eq(leads.id, row.id), eq(leads.status, row.status)))
        .returning({ id: leads.id });
      if (!updated) {
        skippedIds.push(leadId);
        continue;
      }
      expiredIds.push(updated.id);
      await recordAudit(tx, {
        actorUserId: actorUserId,
        entityType: 'lead',
        entityId: row.id,
        action: 'EXPIRED',
        before: { status: row.status },
        after: { status: 'EXPIRED' },
        context: {
          reason: 'auto_expiry_30d_inactive',
          olderThanDays: args?.olderThanDays ?? DEFAULT_EXPIRY_DAYS,
        },
      });
    }
    return { expiredIds, skippedIds };
  });
}

/**
 * Reactivate an EXPIRED lead. Requires an actor + reason — this is an
 * authorised exception to the automatic-expiry rule. The lead returns
 * to CONTACTED (not NEW — reactivation means the operator intentionally
 * resumed engagement). Audit event captures the reason.
 */
export async function reactivateExpiredLead(args: {
  leadId: string;
  actorUserId: string;
  reason: string;
}): Promise<void> {
  const reason = args.reason.trim();
  if (reason.length < 3) {
    throw new BusinessRuleError(
      'REACTIVATION_REASON_REQUIRED',
      'A reason (min 3 characters) is required to reactivate an expired lead.',
    );
  }
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(leads)
      .where(eq(leads.id, args.leadId))
      .for('update')
      .limit(1);
    if (!row) throw new NotFoundError('Lead');
    if (row.status !== 'EXPIRED') {
      throw new BusinessRuleError(
        'LEAD_NOT_EXPIRED',
        `Cannot reactivate a lead in status ${row.status}; only EXPIRED leads reactivate.`,
      );
    }
    const now = new Date();
    await tx
      .update(leads)
      .set({
        status: 'CONTACTED',
        // expiredAt + expiredByReason are preserved as audit — do not clear.
        updatedAt: now,
      })
      .where(and(eq(leads.id, row.id), eq(leads.status, 'EXPIRED'), isNull(leads.convertedAt)));
    await recordAudit(tx, {
      actorUserId: args.actorUserId,
      entityType: 'lead',
      entityId: row.id,
      action: 'REACTIVATED',
      before: { status: 'EXPIRED' },
      after: { status: 'CONTACTED' },
      context: { reason, originalExpiredAt: row.expiredAt?.toISOString() ?? null },
    });
  });
}

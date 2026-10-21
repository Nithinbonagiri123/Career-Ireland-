import { eq, sql } from 'drizzle-orm';
import { recordAudit } from '@/lib/audit/withAudit';
import {
  checkPermission,
  getSession,
  requireInternalStaff,
  type Session,
} from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { serviceEngagements } from '@/lib/db/schema/commerce';
import { currencies } from '@/lib/db/schema/currencies';
import { persons } from '@/lib/db/schema/persons';
import { serviceCatalogItems } from '@/lib/db/schema/services';
import { AuthorizationError, BusinessRuleError, ValidationError } from '@/lib/errors';
import { fetchAppSettings } from '@/modules/settings/service';
import {
  type GrantComplimentaryServiceInput,
  GrantComplimentaryServiceSchema,
} from './complimentary-schemas';
import { insertInvoice } from './service';

/**
 * Stage B Wave 4 — grant a genuine €0.00 complimentary service.
 *
 * One transaction: service engagement (agreed €0.00, straight to ACTIVE —
 * nothing is pending payment) + a real sequential invoice (next INV number,
 * zero totals, settlement kind COMPLIMENTARY, status PAID at birth). NO
 * payment, NO verification, NO receipt — the receipts table's `amount > 0`
 * CHECK makes a €0 receipt impossible even through a bug, and revenue
 * dashboards sum verified payments so this contributes exactly nothing.
 *
 * Authorization: ADMIN / account owner, or an explicit
 * ('candidate_services','complimentary','create') grant. The reason is
 * mandatory (schema + DB CHECK) and lands on the invoice row, in the
 * audit event, and on the printed document.
 *
 * Retries / double-submits reuse the Wave 1 machinery: an advisory lock
 * serializes concurrent calls with the same idempotency key and the audit
 * replay row returns the already-issued invoice instead of issuing twice.
 * The `invoices_engagement_live_uq` partial unique index is the DB
 * backstop. Sequence numbers are allocated inside the transaction, so a
 * rolled-back attempt never burns (or reuses) a number.
 */
export async function grantComplimentaryService(
  input: GrantComplimentaryServiceInput,
): Promise<{ invoiceNumber: string; engagementId: string; replayed: boolean }> {
  const session = await requireInternalStaff();
  await assertCanGrantComplimentary(session);

  const parsed = GrantComplimentaryServiceSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid complimentary grant',
      parsed.error.flatten().fieldErrors as Record<string, string>,
    );
  }
  const d = parsed.data;

  // Read settings BEFORE opening the transaction: fetchAppSettings uses
  // its own pooled connection, and grabbing one while this transaction
  // holds another can starve the small dev/prod pool into a hang when
  // concurrent actions queue behind our row locks.
  const settings = await fetchAppSettings();

  return db.transaction(async (tx) => {
    // Serialize concurrent submissions of the same dialog (double-click,
    // network retry). Same lock family as generate-invoice / direct-payment.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`complimentary-grant:${d.idempotencyKey}`}))`,
    );

    // Replay? The audit row written at the end of a successful grant
    // carries the idempotency key — return the original result.
    const [prior] = await tx.execute<{
      invoice_number: string | null;
      engagement_id: string | null;
    }>(sql`
      SELECT (context ->> 'invoiceNumber') AS invoice_number,
             (context ->> 'engagementId')  AS engagement_id
      FROM audit_events
      WHERE action = 'COMPLIMENTARY_GRANTED'
        AND (context ->> 'idempotencyKey') = ${d.idempotencyKey}
        -- Release-readiness item 3: replay must match the same person,
        -- so a reused key can never surface another person's grant.
        AND (context ->> 'personId') = ${d.personId}
      ORDER BY occurred_at DESC
      LIMIT 1
    `);
    if (prior?.invoice_number && prior.engagement_id) {
      return {
        invoiceNumber: prior.invoice_number,
        engagementId: prior.engagement_id,
        replayed: true,
      };
    }

    const [person] = await tx
      .select({ id: persons.id, firstName: persons.firstName, lastName: persons.lastName })
      .from(persons)
      .where(eq(persons.id, d.personId))
      .limit(1);
    if (!person) throw new BusinessRuleError('PERSON_NOT_FOUND', 'Person not found.');

    const [service] = await tx
      .select({
        id: serviceCatalogItems.id,
        name: serviceCatalogItems.name,
        isActive: serviceCatalogItems.isActive,
      })
      .from(serviceCatalogItems)
      .where(eq(serviceCatalogItems.id, d.serviceCatalogItemId))
      .limit(1);
    if (!service?.isActive) {
      throw new BusinessRuleError('SERVICE_NOT_FOUND', 'Service not found or inactive.');
    }

    const [currency] = await tx
      .select({ code: currencies.code })
      .from(currencies)
      .where(eq(currencies.code, d.currencyCode))
      .limit(1);
    if (!currency) {
      throw new BusinessRuleError(
        'CURRENCY_NOT_FOUND',
        `Currency ${d.currencyCode} not configured.`,
      );
    }

    // Duplicate-grant guard: one live complimentary grant per person +
    // service. A genuine repeat is handled through the correction path
    // (void the first with a reason, then grant again) so every free
    // issuance stays deliberate and documented.
    const [dup] = await tx.execute<{ number: string }>(sql`
      SELECT i.number FROM invoices i
      JOIN service_engagements e ON e.id = i.service_engagement_id
      WHERE i.settlement_kind = 'COMPLIMENTARY'
        AND i.status != 'VOIDED'
        AND e.payer_person_id = ${person.id}
        AND e.service_catalog_item_id = ${service.id}
      LIMIT 1
    `);
    if (dup) {
      throw new BusinessRuleError(
        'COMPLIMENTARY_ALREADY_GRANTED',
        `${service.name} was already granted complimentary to this person (invoice ${dup.number}). Void that invoice first if this is a correction.`,
      );
    }

    // The free service is live the moment it is granted — PENDING_PAYMENT
    // would be a lie (nothing is pending) and REQUESTED would hide it from
    // the operator's active list.
    const [engagement] = await tx
      .insert(serviceEngagements)
      .values({
        serviceCatalogItemId: service.id,
        payerPersonId: person.id,
        beneficiaryPersonId: person.id,
        agreedAmount: '0.00',
        currencyCode: d.currencyCode,
        status: 'ACTIVE',
        notes: `Complimentary: ${d.reason}`,
      })
      .returning({ id: serviceEngagements.id });
    if (!engagement) throw new Error('service_engagements insert returned no row');

    // Real sequential invoice. VAT fields recorded exactly as paid flows
    // record them — rate from settings (0 when not registered), treatment
    // STANDARD for person payers — the arithmetic on a €0.00 base is
    // trivially consistent. Whether a free supply has further tax
    // consequences (deemed-supply rules) is the accountant's call; the
    // row preserves everything they need to review it.
    const effectiveVatRate = settings.vatRegistered ? settings.vatRatePercent : '0.00';
    const invoice = await insertInvoice(tx, {
      payerPersonId: person.id,
      serviceEngagementId: engagement.id,
      serviceCatalogItemId: service.id,
      qty: 1,
      unitPrice: '0.00',
      vatRatePercent: effectiveVatRate,
      vatTreatment: 'STANDARD',
      currencyCode: d.currencyCode,
      lineDescription: service.name,
      issuedByUserId: session.user.id,
      paymentTermsDays: null,
      complimentary: { reason: d.reason, grantedByUserId: session.user.id },
    });

    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'invoice',
      entityId: invoice.id,
      action: 'COMPLIMENTARY_GRANTED',
      after: {
        number: invoice.number,
        totalAmount: invoice.totalAmount,
        serviceName: service.name,
        reason: d.reason,
      },
      context: {
        idempotencyKey: d.idempotencyKey,
        invoiceNumber: invoice.number,
        engagementId: engagement.id,
        personId: person.id,
      },
    });

    return { invoiceNumber: invoice.number, engagementId: engagement.id, replayed: false };
  });
}

/**
 * ADMIN / owner, or the explicit complimentary grant. Exported for the
 * page-level `canComplimentary` flags so UI visibility and the server
 * gate share one rule.
 */
export async function canGrantComplimentary(): Promise<boolean> {
  const s = await getSession();
  if (!s) return false;
  if (s.user.isOwner || s.user.role === 'ADMIN') return true;
  return checkPermission('candidate_services', 'complimentary', 'create');
}

async function assertCanGrantComplimentary(session: Session): Promise<void> {
  if (session.user.isOwner || session.user.role === 'ADMIN') return;
  const granted = await checkPermission('candidate_services', 'complimentary', 'create');
  if (!granted) throw new AuthorizationError();
}

/**
 * Guard used by payment-recording paths: an engagement whose live invoice
 * is complimentary must never receive a payment — there is nothing owed,
 * and a verified payment would masquerade as revenue for a free service.
 */
export async function assertEngagementNotComplimentary(
  tx: Pick<typeof db, 'execute'>,
  serviceEngagementId: string,
): Promise<void> {
  const [row] = await tx.execute<{ n: string }>(sql`
    SELECT COUNT(*)::text AS n FROM invoices
    WHERE service_engagement_id = ${serviceEngagementId}
      AND settlement_kind = 'COMPLIMENTARY'
      AND status != 'VOIDED'
  `);
  if (Number(row?.n ?? '0') > 0) {
    throw new BusinessRuleError(
      'ENGAGEMENT_COMPLIMENTARY',
      'This service was granted complimentary — no payment is due and none can be recorded against it.',
    );
  }
}

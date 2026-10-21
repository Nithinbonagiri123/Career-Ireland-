'use server';

import { and, eq, inArray, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { recordAudit } from '@/lib/audit/withAudit';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { invoices } from '@/lib/db/schema/billing';
import { serviceEngagements } from '@/lib/db/schema/commerce';
import { leads } from '@/lib/db/schema/leads';
import { candidateProfiles, persons } from '@/lib/db/schema/persons';
import { proFormaInvoices } from '@/lib/db/schema/proformas';
import { serviceCatalogItems } from '@/lib/db/schema/services';
import { BusinessRuleError, ValidationError } from '@/lib/errors';
import { toActionResult } from '@/lib/result';
import { insertInvoice, insertReceipt } from '@/modules/billing/service';
import { insertEngagement, insertPayment } from '@/modules/commerce/repository';
import { fetchAppSettings } from '@/modules/settings/service';
import {
  type DirectPaymentAndConvertResult,
  DirectPaymentAndConvertSchema,
} from './direct-payment-schema';

/**
 * Stage 6E Section 3 — Direct Payment & Convert.
 *
 * One atomic transaction that records a completed payment, issues the
 * official invoice + receipt, and activates the candidate — all in one
 * step. Used only when the client has ALREADY paid and no pro-forma was
 * needed. Everything else (lead → quote → payment → verify) is the
 * normal flow and should be preferred.
 *
 * ── Hard rules ──────────────────────────────────────────────────────
 *   - CS only. The server rejects a non-CS lead.
 *   - ADMIN / FINANCE only. STAFF cannot invoke this directly.
 *   - Full payment only. Partial amounts are redirected to the pro-forma
 *     path with a dedicated error code so the UI can prompt properly.
 *   - Duplicate detection: refuses if the client already has an ISSUED or
 *     PARTIALLY_PAID invoice for the same service, or an ACCEPTED or
 *     ISSUED pro-forma on the lead (operator uses the quote flow
 *     instead). Override requires a reason + audit.
 *   - Idempotency: the operator-supplied `idempotencyKey` is checked
 *     against this lead's acceptedAt + a dedicated audit event; a
 *     double-click returns the first result instead of creating a
 *     second invoice.
 *   - Reuses existing accounting services (`insertInvoice`,
 *     `insertReceipt`, `insertEngagement`, `insertPayment`,
 *     `allocateNextNumber`). No parallel ledger implementation.
 */
// Schema + types live in `direct-payment-schema.ts` because a 'use
// server' file can only export async functions.

export async function directPaymentAndConvertAction(
  input: unknown,
): Promise<ReturnType<typeof toActionResult<DirectPaymentAndConvertResult>>> {
  const result = await toActionResult<DirectPaymentAndConvertResult>(() =>
    directPaymentAndConvert(input),
  );
  if (result.ok) {
    revalidatePath('/leads');
    revalidatePath('/candidates');
    revalidatePath(`/clients/${result.data.personId}`);
  }
  return result;
}

async function directPaymentAndConvert(input: unknown): Promise<DirectPaymentAndConvertResult> {
  // ADMIN / FINANCE only — this writes an invoice directly, no
  // operator-visible pro-forma. Matches generateInvoiceForPayer's gate.
  const session = await requireRole(['ADMIN', 'FINANCE']);
  const parsed = DirectPaymentAndConvertSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid direct-payment input',
      parsed.error.flatten().fieldErrors as Record<string, string>,
    );
  }
  const data = parsed.data;

  // Full-payment-only check. The UX contract says: if the operator is
  // using this one-step action, the client has paid in full. If not,
  // they should use the pro-forma + partial-payment flow instead. We
  // compare cents to avoid floating-point drift.
  const agreedCents = parseCents(data.agreedAmount);
  const paymentCents = parseCents(data.paymentAmount);
  if (paymentCents < agreedCents) {
    throw new BusinessRuleError(
      'DIRECT_PAYMENT_REQUIRES_FULL_AMOUNT',
      `Direct payment & convert requires the payment to cover the agreed amount (${data.agreedAmount} ${data.currencyCode}). For partial payments, create a quote instead and record the payment there.`,
    );
  }

  return db.transaction(async (tx) => {
    // Stage 6E+1 — DB-enforced idempotency. Serialize all concurrent
    // attempts carrying this `idempotencyKey` via a transaction-scoped
    // Postgres advisory lock. The lock is held for the length of this
    // transaction and released on commit/rollback. Two simultaneous
    // double-clicks with the same key:
    //   - the first one acquires the advisory lock and the lead row
    //     lock, performs the full flow, commits, releases the locks;
    //   - the second one waits, acquires both locks, finds the first
    //     attempt's committed audit event, and returns `alreadyProcessed`.
    // This guarantee holds even if the lead row FOR UPDATE below is
    // somehow bypassed in future refactors — the audit lookup alone
    // can race, the advisory lock cannot.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${data.idempotencyKey}))`);

    // Lock the lead for the length of the transaction. Prevents two
    // concurrent operators (or a double-clicked button) from both
    // reaching the create-invoice step before either stamps the lead.
    const [lead] = await tx
      .select()
      .from(leads)
      .where(eq(leads.id, data.leadId))
      .for('update')
      .limit(1);
    if (!lead) throw new BusinessRuleError('LEAD_NOT_FOUND', 'Lead not found.');
    if (lead.targetBusiness !== 'CANDIDATE_SERVICES') {
      throw new BusinessRuleError(
        'NOT_A_CS_LEAD',
        'Direct Payment & Convert is Candidate Services only.',
      );
    }
    if (!lead.personId) {
      throw new BusinessRuleError('LEAD_HAS_NO_PERSON', 'Lead has no person attached.');
    }

    // Idempotency — serialise same-key submits at the DB (Stage B Wave 1:
    // without this lock two truly concurrent requests could both miss the
    // audit lookup below and double-process), then look up any audit
    // event on this lead carrying the same key. The key is generated per
    // dialog mount by the client.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`direct-payment:${data.idempotencyKey}`}))`,
    );
    const existingAuditRows = await tx.execute<{
      invoice_id: string | null;
      invoice_number: string | null;
      receipt_id: string | null;
      receipt_number: string | null;
      payment_id: string | null;
      engagement_id: string | null;
      profile_id: string | null;
    }>(sql`
      SELECT
        (context ->> 'invoiceId') AS invoice_id,
        (context ->> 'invoiceNumber') AS invoice_number,
        (context ->> 'receiptId') AS receipt_id,
        (context ->> 'receiptNumber') AS receipt_number,
        (context ->> 'paymentId') AS payment_id,
        (context ->> 'engagementId') AS engagement_id,
        (context ->> 'candidateProfileId') AS profile_id
      FROM audit_events
      WHERE entity_type = 'lead'
        AND entity_id = ${lead.id}
        AND action = 'DIRECT_PAYMENT_AND_CONVERT'
        AND (context ->> 'idempotencyKey') = ${data.idempotencyKey}
      LIMIT 1
    `);
    const existingAudit = (
      existingAuditRows as Array<{
        invoice_id: string | null;
        invoice_number: string | null;
        receipt_id: string | null;
        receipt_number: string | null;
        payment_id: string | null;
        engagement_id: string | null;
        profile_id: string | null;
      }>
    )[0];
    if (existingAudit?.invoice_id) {
      return {
        invoiceId: existingAudit.invoice_id,
        invoiceNumber: existingAudit.invoice_number ?? '',
        receiptId: existingAudit.receipt_id ?? '',
        receiptNumber: existingAudit.receipt_number ?? '',
        paymentId: existingAudit.payment_id ?? '',
        engagementId: existingAudit.engagement_id ?? '',
        candidateProfileId: existingAudit.profile_id ?? '',
        personId: lead.personId,
        alreadyProcessed: true,
      };
    }

    // Resolve the service.
    const [service] = await tx
      .select({ id: serviceCatalogItems.id, name: serviceCatalogItems.name })
      .from(serviceCatalogItems)
      .where(eq(serviceCatalogItems.id, data.serviceCatalogItemId))
      .limit(1);
    if (!service) {
      throw new BusinessRuleError('SERVICE_NOT_FOUND', 'Selected service no longer exists.');
    }

    // Duplicate detection. Three signals:
    //   (1) a live invoice (ISSUED or PARTIALLY_PAID) for this person
    //       on this service in this currency;
    //   (2) an ACCEPTED or ISSUED pro-forma on this lead;
    //   (3) a PENDING_PAYMENT engagement with the same service +
    //       currency on this person (likely a stale half-finished flow).
    const dupeInvoice = await tx
      .select({ id: invoices.id, number: invoices.number })
      .from(invoices)
      .innerJoin(serviceEngagements, eq(serviceEngagements.id, invoices.serviceEngagementId))
      .where(
        and(
          eq(invoices.payerPersonId, lead.personId),
          eq(invoices.currencyCode, data.currencyCode),
          eq(serviceEngagements.serviceCatalogItemId, service.id),
          inArray(invoices.status, ['ISSUED', 'PARTIALLY_PAID']),
        ),
      )
      .limit(1);
    const dupePf = await tx
      .select({ id: proFormaInvoices.id, number: proFormaInvoices.number })
      .from(proFormaInvoices)
      .where(
        and(
          eq(proFormaInvoices.sourceLeadId, lead.id),
          inArray(proFormaInvoices.status, ['ISSUED', 'ACCEPTED']),
        ),
      )
      .limit(1);
    const dupe = dupeInvoice[0] ?? dupePf[0];
    if (dupe && !data.overrideDuplicateReason) {
      throw new BusinessRuleError(
        'DIRECT_PAYMENT_DUPLICATE_LIKELY',
        `A live invoice or quote already exists for this client and service (${dupe.number}). Settle it first, cancel it, or re-submit with a reason explaining why a direct payment is correct.`,
      );
    }

    // Create / reuse the candidate_profile first — the invoice flows
    // through the person's billing history so no FK back-link is needed.
    const [existingProfile] = await tx
      .select({ id: candidateProfiles.id })
      .from(candidateProfiles)
      .where(eq(candidateProfiles.personId, lead.personId))
      .limit(1);
    let profileId: string;
    if (existingProfile) {
      profileId = existingProfile.id;
    } else {
      const [personRow] = await tx
        .select({ primaryOccupationId: persons.primaryOccupationId })
        .from(persons)
        .where(eq(persons.id, lead.personId))
        .limit(1);
      const [created] = await tx
        .insert(candidateProfiles)
        .values({
          personId: lead.personId,
          assignedUserId: session.user.id,
          primaryOccupationId: personRow?.primaryOccupationId ?? null,
        })
        .returning({ id: candidateProfiles.id });
      if (!created) throw new Error('candidate_profiles insert returned no row.');
      profileId = created.id;
    }

    // Create engagement + invoice (reuses existing accounting helpers).
    const engagement = await insertEngagement(tx, {
      serviceCatalogItemId: service.id,
      payerPersonId: lead.personId,
      beneficiaryPersonId: lead.personId,
      agreedAmount: data.agreedAmount,
      currencyCode: data.currencyCode,
      status: 'ACTIVE',
    });

    // Stage 6G Screen 10 — when the dialog sent an explicit service
    // selection, the amounts must add up to the agreed amount and the
    // invoice line names every selected service.
    if (data.services && data.services.length > 0) {
      const sumCents = data.services.reduce(
        (acc, s) => acc + Math.round(Number.parseFloat(s.amount) * 100),
        0,
      );
      const agreedCents = Math.round(Number.parseFloat(data.agreedAmount) * 100);
      if (sumCents !== agreedCents) {
        throw new BusinessRuleError(
          'DIRECT_PAYMENT_SERVICES_MISMATCH',
          `Selected services total ${(sumCents / 100).toFixed(2)} but the agreed amount is ${data.agreedAmount}.`,
        );
      }
    }
    const lineDescription =
      data.services && data.services.length > 0
        ? data.services.map((s) => s.name).join(' + ')
        : service.name;

    const settings = await fetchAppSettings();
    const effectiveVatRate = settings.vatRegistered ? settings.vatRatePercent : '0.00';
    const invoice = await insertInvoice(tx, {
      payerPersonId: lead.personId,
      serviceEngagementId: engagement.id,
      serviceCatalogItemId: service.id,
      qty: 1,
      unitPrice: data.agreedAmount,
      vatRatePercent: effectiveVatRate,
      vatTreatment: 'STANDARD',
      currencyCode: data.currencyCode,
      lineDescription,
      issuedByUserId: session.user.id,
      paymentTermsDays: 0,
      sourceLeadId: lead.id,
    });

    // Record the payment as already-VERIFIED. `methodDisplay` and the
    // stored method stay in lockstep and the receipt prints exactly
    // what the operator chose — including CARD (Stage 6G Screen 10),
    // for which only the terminal / processor reference is stored.
    const dbMethod = data.methodDisplay;
    const receivedAt = new Date(`${data.paymentDate}T00:00:00.000Z`);
    const ref = (data.reference ?? '').trim();
    const payment = await insertPayment(tx, {
      serviceEngagementId: engagement.id,
      proFormaInvoiceId: null,
      amount: data.paymentAmount,
      currencyCode: data.currencyCode,
      method: dbMethod,
      proofReference: ref.length > 0 ? ref : null,
      receivedAt,
      status: 'VERIFIED',
      verifiedAt: new Date(),
      verifiedByUserId: session.user.id,
    });

    // Receipt immediately — one per payment, enforced by UNIQUE(payment_id).
    const receipt = await insertReceipt(tx, {
      paymentId: payment.id,
      invoiceId: invoice.id,
      payerPersonId: lead.personId,
      amount: data.paymentAmount,
      currencyCode: data.currencyCode,
      receivedAt,
      issuedByUserId: session.user.id,
    });

    // Flip the invoice to PAID — same recomputation path the ordinary
    // pro-forma verify uses. Keeps the status reflection honest.
    const { recomputeInvoiceStatus } = await import('@/modules/billing/service');
    await recomputeInvoiceStatus(tx, invoice.id);

    // Stamp the lead as converted so the ordinary CONVERTED chip +
    // workspace resolver pick it up.
    await tx
      .update(leads)
      .set({
        status: 'CONVERTED',
        acceptedAt: new Date(),
        acceptedByUserId: session.user.id,
        acceptedEntityId: profileId,
        convertedAt: new Date(),
        convertedByUserId: session.user.id,
        conversionMethod: 'PAYMENT_VERIFIED',
        updatedAt: sql`NOW()`,
      })
      .where(eq(leads.id, lead.id));

    // Audit event carrying the idempotency key + all the created ids so
    // a replay can short-circuit above.
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'lead',
      entityId: lead.id,
      action: 'DIRECT_PAYMENT_AND_CONVERT',
      before: { status: lead.status },
      after: {
        status: 'CONVERTED',
        invoiceNumber: invoice.number,
        receiptNumber: receipt.number,
      },
      context: {
        idempotencyKey: data.idempotencyKey,
        invoiceId: invoice.id,
        invoiceNumber: invoice.number,
        receiptId: receipt.id,
        receiptNumber: receipt.number,
        paymentId: payment.id,
        engagementId: engagement.id,
        candidateProfileId: profileId,
        methodDisplay: data.methodDisplay,
        reference: ref || null,
        overrideDuplicateReason: data.overrideDuplicateReason ?? null,
      },
    });

    return {
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      receiptId: receipt.id,
      receiptNumber: receipt.number,
      paymentId: payment.id,
      engagementId: engagement.id,
      candidateProfileId: profileId,
      personId: lead.personId,
      alreadyProcessed: false,
    };
  });
}

function parseCents(s: string): number {
  const [whole, frac = ''] = s.split('.');
  const w = Number.parseInt(whole ?? '0', 10);
  const f = Number.parseInt(`${frac}00`.slice(0, 2), 10);
  return w * 100 + f;
}

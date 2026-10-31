import { and, eq, gte, inArray, isNotNull, isNull, ne, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { DbExecutor } from '@/lib/audit/withAudit';
import { recordAudit } from '@/lib/audit/withAudit';
import { requireFinanceAuthority } from '@/lib/auth/finance-policy';
import { db } from '@/lib/db/client';
import { invoices } from '@/lib/db/schema/billing';
import { serviceEngagements } from '@/lib/db/schema/commerce';
import { leads } from '@/lib/db/schema/leads';
import { employers, jobRequisitions, placements } from '@/lib/db/schema/recruitment';
import { serviceCatalogItems, servicePackages } from '@/lib/db/schema/services';
import { BusinessRuleError, ValidationError } from '@/lib/errors';
import { insertEngagement } from '@/modules/commerce/repository';
import { fetchAppSettings } from '@/modules/settings/service';
import { lockEmployerForBilling } from './employer-lock';
import { insertInvoice } from './service';

/**
 * Generate one invoice against a single service, in one transaction.
 *
 * Called from the lead-creation dialog (atomic person+lead+invoice),
 * the leads-table row menu (add another invoice to an existing lead),
 * and the employer detail page.
 *
 * Fields:
 *   - qty          — line quantity (defaults to 1 at the caller)
 *   - unitPrice    — per-unit money string. Always editable in the UI;
 *                    a chosen `servicePackage` merely prefills it.
 *   - currencyCode — 3-letter ISO code (EUR/ZAR/etc). Also editable.
 *
 * VAT rate is read from `app_settings.vat_rate_percent` and applied by
 * `insertInvoice` — never hardcoded, never a client-supplied value.
 *
 * Rejects if the service is `payerType`-incompatible with the caller
 * choice (e.g. can't invoice an EMPLOYER-only service to a person).
 */

export const GenerateInvoiceSchema = z.object({
  payerMode: z.enum(['PERSON', 'EMPLOYER']),
  payerId: z.string().uuid(),
  serviceCatalogItemId: z.string().uuid(),
  /** Link to the package the operator started from — informational
      only; price + currency below are always the source of truth. */
  servicePackageId: z.string().uuid().nullish(),
  qty: z.number().int().positive().max(9999),
  /** Per-unit price. Always required; the UI prefills from a package
      when one is picked but the operator can override. */
  unitPrice: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, 'Unit price must be a decimal with up to 2 decimal places'),
  currencyCode: z.string().length(3),
  /** Optional line description override; falls back to the service name. */
  lineDescription: z.string().max(280).nullish(),
  /** Optional cross-business back-links: set when the invoice is being
      raised from a specific case / placement / requisition so the row
      is discoverable from those detail pages without a heuristic
      lookup. All nullish — a manual person-scoped invoice sets none. */
  immigrationCaseId: z.string().uuid().nullish(),
  jobRequisitionId: z.string().uuid().nullish(),
  placementId: z.string().uuid().nullish(),
  /** Recruitment P0 — the lead this invoice is raised on (leads-table
      "Invoice" / "Add another invoice…"). Server-validated: the lead must
      exist and its payer must be this invoice's payer. Stamped on the
      invoice so conversion can find and reuse it instead of charging the
      payer a second time. */
  sourceLeadId: z.string().uuid().nullish(),
  /** Recruitment P0 — a placement is normally invoiced once. A second
      live invoice for the same placement needs this reason (finance
      only, like every invoice issue) and is audited. */
  overridePlacementInvoiceReason: z.string().max(500).nullish(),
  /** Stage 6D Wave 1f — operator-confirmed override for the duplicate-
      invoice detector. The server rejects a second invoice with the
      same payer + service + amount + currency where an ISSUED or
      PARTIALLY_PAID row already exists; the operator may re-submit with
      this flag set and a reason to override (e.g. legitimate repeat
      service in the same month). The flag + reason are audited on the
      new invoice row. */
  overrideDuplicateReason: z.string().max(500).nullish(),
  /** Stage B Wave 1 — client-generated per-dialog-mount key. A replayed
   *  submit (double-click, network retry) returns the original invoice
   *  instead of raising a second engagement + invoice. */
  idempotencyKey: z.string().min(8).max(128).nullish(),
});

export type GenerateInvoiceInput = z.infer<typeof GenerateInvoiceSchema>;

export type GenerateInvoiceResult = {
  invoiceId: string;
  invoiceNumber: string;
  engagementId: string;
  /** Where to redirect the user to see the printable invoice. */
  printPath: string;
};

export async function generateInvoiceForPayer(input: unknown): Promise<GenerateInvoiceResult> {
  // Stage 6D Wave 1e — tightened from `requireInternalStaff` to
  // ADMIN / FINANCE only. Removing the Generate invoice buttons from
  // the UI doesn't revoke the capability; the server gate must do
  // that. The remaining buttons (employer page, immigration case page,
  // Immigration lead's optional first invoice) are all finance-level
  // actions — STAFF should not create invoices directly.
  const session = await requireFinanceAuthority('ISSUE', 'generateInvoiceForPayer');
  const parsed = GenerateInvoiceSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid invoice request',
      parsed.error.flatten().fieldErrors as Record<string, string>,
    );
  }
  const data = parsed.data;

  // Read VAT rate from settings up-front so it lives on the invoice
  // even if settings changes later — the row is a snapshot.
  const settings = await fetchAppSettings();

  return db.transaction(async (tx) => {
    // Stage B Wave 1 — idempotent replay, serialised at the DB. The
    // transaction-scoped advisory lock makes two concurrent submits with
    // the same key run one-after-another: the second waits here, then its
    // audit lookup below finds the first's row and replays it. Without
    // the lock both lookups could race past each other and double-issue.
    if (data.idempotencyKey) {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`invoice-gen:${data.idempotencyKey}`}))`,
      );
    }
    // The ISSUED audit row carries the key; a second submit with the same
    // key returns the first result without touching the ledger.
    if (data.idempotencyKey) {
      const priorRows = await tx.execute<{
        invoice_id: string;
        invoice_number: string | null;
        engagement_id: string | null;
        print_path: string | null;
      }>(sql`
        SELECT entity_id AS invoice_id,
               (context ->> 'invoiceNumber') AS invoice_number,
               (context ->> 'engagementId') AS engagement_id,
               (context ->> 'printPath') AS print_path
        FROM audit_events
        WHERE entity_type = 'invoice'
          AND action = 'ISSUED'
          AND (context ->> 'idempotencyKey') = ${data.idempotencyKey}
          -- Release-readiness item 3: a replay only matches the SAME
          -- payer; a reused or guessed key submitted for a different
          -- payer finds nothing and proceeds as a fresh request, so it
          -- can never disclose another payer's invoice number or print
          -- path. (Rows written before this change lack the payer
          -- fields and simply never replay — keys are per dialog
          -- mount, so nothing legitimate is lost.)
          AND (context ->> 'payerMode') = ${data.payerMode}
          AND (context ->> 'payerId') = ${data.payerId}
        ORDER BY occurred_at DESC
        LIMIT 1
      `);
      const prior = (
        priorRows as Array<{
          invoice_id: string;
          invoice_number: string | null;
          engagement_id: string | null;
          print_path: string | null;
        }>
      )[0];
      if (prior?.invoice_id && prior.invoice_number && prior.print_path) {
        return {
          invoiceId: prior.invoice_id,
          invoiceNumber: prior.invoice_number,
          engagementId: prior.engagement_id ?? '',
          printPath: prior.print_path,
        };
      }
    }

    // Recruitment P0 — serialise with lead conversion recording a new
    // payment for the same employer (see employer-lock.ts). Taken before
    // the duplicate check so it sees any invoice the other path created.
    if (data.payerMode === 'EMPLOYER') await lockEmployerForBilling(tx, data.payerId);

    // Resolve the service catalog item (and its payerType constraint).
    const [service] = await tx
      .select({
        id: serviceCatalogItems.id,
        name: serviceCatalogItems.name,
        payerType: serviceCatalogItems.payerType,
        isActive: serviceCatalogItems.isActive,
      })
      .from(serviceCatalogItems)
      .where(eq(serviceCatalogItems.id, data.serviceCatalogItemId))
      .limit(1);
    if (!service) {
      throw new BusinessRuleError('SERVICE_NOT_FOUND', 'Service not found');
    }
    if (!service.isActive) {
      throw new BusinessRuleError('SERVICE_INACTIVE', 'This service is no longer active');
    }
    if (service.payerType !== 'ANY' && service.payerType !== data.payerMode) {
      throw new BusinessRuleError(
        'PAYER_MISMATCH',
        `This service is only invoiceable to a ${service.payerType.toLowerCase()}`,
      );
    }

    // If a package was picked, sanity-check it belongs to the service.
    // The unit price + currency come from the input regardless, so a
    // stale package reference doesn't corrupt pricing — but we still
    // refuse a mismatched pair to keep the engagement's servicePackageId
    // honest.
    if (data.servicePackageId) {
      const [pkg] = await tx
        .select({
          serviceCatalogItemId: servicePackages.serviceCatalogItemId,
          isActive: servicePackages.isActive,
        })
        .from(servicePackages)
        .where(eq(servicePackages.id, data.servicePackageId))
        .limit(1);
      if (!pkg) throw new BusinessRuleError('PACKAGE_NOT_FOUND', 'Service package not found');
      if (pkg.serviceCatalogItemId !== service.id) {
        throw new BusinessRuleError(
          'PACKAGE_MISMATCH',
          'Chosen package does not belong to the selected service',
        );
      }
      if (!pkg.isActive) {
        throw new BusinessRuleError('PACKAGE_INACTIVE', 'This package is no longer active');
      }
    }

    // Recruitment P0 — server-validated cross-links. Every check runs
    // before anything is written, inside the same transaction.
    const links = await resolveInvoiceLinks(tx, data);

    // Engagement first — invoice references it. Agreed amount on the
    // engagement is stored as the total subtotal (qty × unit) for
    // downstream reporting; VAT lives only on the invoice row.
    const subtotalCents = Math.round(Number.parseFloat(data.unitPrice) * 100) * data.qty;
    const engagementAmount = (subtotalCents / 100).toFixed(2);

    // Stage 6D Wave 1f — duplicate-invoice detector. Finds any existing
    // invoice on the same payer + same service + same subtotal + same
    // currency that is still live (ISSUED or PARTIALLY_PAID; for employers
    // also a PAID enquiry-conversion invoice from the last 30 days). An
    // operator can legitimately repeat the service — the override flag
    // + reason let them proceed with an audit trail. Does not block
    // genuinely separate services (service id differs → no match) or
    // paid-off repeats (status filter excludes PAID).
    const existingDuplicate = await findLiveDuplicateInvoice(tx, {
      payerPersonId: data.payerMode === 'PERSON' ? data.payerId : null,
      payerEmployerId: data.payerMode === 'EMPLOYER' ? data.payerId : null,
      serviceCatalogItemId: service.id,
      // A fee for a different placement is a different sale; the
      // per-placement guard (resolveInvoiceLinks) covers repeats.
      excludeOtherPlacementsThan: links.placementId,
    });
    if (existingDuplicate && !data.overrideDuplicateReason) {
      throw new BusinessRuleError(
        'DUPLICATE_INVOICE_LIKELY',
        `An unpaid invoice for the same service already exists on this payer: ${existingDuplicate.number} for ${existingDuplicate.totalAmount} ${existingDuplicate.currencyCode}. A second invoice doubles what this payer appears to owe. Settle or void the first one, or provide a reason to confirm this really is a separate sale.`,
      );
    }
    if (existingDuplicate && data.overrideDuplicateReason) {
      await recordAudit(tx, {
        actorUserId: session.user.id,
        entityType: 'invoice',
        entityId: existingDuplicate.id,
        action: 'DUPLICATE_OVERRIDE',
        context: {
          reason: data.overrideDuplicateReason.trim(),
          note: 'Operator confirmed a second invoice is correct despite a live match.',
        },
      });
    }
    const engagement = await insertEngagement(tx, {
      serviceCatalogItemId: service.id,
      servicePackageId: data.servicePackageId ?? undefined,
      payerPersonId: data.payerMode === 'PERSON' ? data.payerId : undefined,
      payerEmployerId: data.payerMode === 'EMPLOYER' ? data.payerId : undefined,
      agreedAmount: engagementAmount,
      currencyCode: data.currencyCode,
      status: 'PENDING_PAYMENT',
    });
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'service_engagement',
      entityId: engagement.id,
      action: 'CREATED',
      after: {
        serviceCatalogItemId: engagement.serviceCatalogItemId,
        qty: data.qty,
        unitPrice: data.unitPrice,
        currency: engagement.currencyCode,
        status: engagement.status,
        via: 'generate_invoice',
      },
    });

    // Phase 3 blueprint §7.2 + §8.3 — pull payment terms AND VAT
    // treatment off the employer in one shot. For PERSON invoices
    // treatment stays STANDARD and terms fall back to the app default.
    let paymentTermsDays: number | null = settings.defaultPaymentTermsDays;
    let vatTreatment: 'STANDARD' | 'REVERSE_CHARGE' | 'EXEMPT' | 'OUTSIDE_SCOPE' = 'STANDARD';
    if (data.payerMode === 'EMPLOYER') {
      const [emp] = await tx
        .select({ terms: employers.paymentTermsDays, treatment: employers.vatTreatment })
        .from(employers)
        .where(eq(employers.id, data.payerId))
        .limit(1);
      if (emp?.terms != null) paymentTermsDays = emp.terms;
      if (emp?.treatment) vatTreatment = emp.treatment;
    }

    const lineDescription = data.lineDescription?.trim() || service.name;
    // Phase 3 blueprint §8.2 + §8.3 — the effective rate is zero when:
    //   - the business isn't VAT-registered yet, OR
    //   - the employer is non-STANDARD (reverse charge, exempt, or
    //     outside scope — all legally 0% with a legend on the invoice).
    const effectiveVatRate =
      settings.vatRegistered && vatTreatment === 'STANDARD' ? settings.vatRatePercent : '0.00';
    const invoice = await insertInvoice(tx, {
      payerPersonId: data.payerMode === 'PERSON' ? data.payerId : null,
      payerEmployerId: data.payerMode === 'EMPLOYER' ? data.payerId : null,
      serviceEngagementId: engagement.id,
      serviceCatalogItemId: service.id,
      qty: data.qty,
      unitPrice: data.unitPrice,
      vatRatePercent: effectiveVatRate,
      vatTreatment,
      currencyCode: data.currencyCode,
      lineDescription,
      issuedByUserId: session.user.id,
      paymentTermsDays,
      immigrationCaseId: links.immigrationCaseId,
      jobRequisitionId: links.jobRequisitionId,
      placementId: links.placementId,
      sourceLeadId: links.sourceLeadId,
    });
    if (links.placementOverride) {
      await recordAudit(tx, {
        actorUserId: session.user.id,
        entityType: 'invoice',
        entityId: links.placementOverride.existingInvoiceId,
        action: 'PLACEMENT_SECOND_INVOICE_OVERRIDE',
        context: {
          placementId: links.placementId,
          newInvoiceNumber: invoice.number,
          reason: links.placementOverride.reason,
          note: 'Finance confirmed a second invoice for the same placement.',
        },
      });
    }
    const printPath =
      data.payerMode === 'PERSON'
        ? `/candidates/${data.payerId}/invoices/${invoice.number}`
        : `/employers/${data.payerId}/invoices/${invoice.number}`;

    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'invoice',
      entityId: invoice.id,
      action: 'ISSUED',
      after: {
        number: invoice.number,
        payerMode: data.payerMode,
        payerId: data.payerId,
        qty: invoice.qty,
        unitPrice: invoice.unitPrice,
        totalAmount: invoice.totalAmount,
        currency: invoice.currencyCode,
        vatRatePercent: effectiveVatRate,
        vatTreatment,
      },
      // Stage B Wave 1 — replay anchor: a resubmit with the same key
      // finds this row and returns the original result (see the
      // idempotency lookup at the top of the transaction).
      // Recruitment P0 — the cross-links are always recorded so the trail
      // shows which placement / job / lead / case the invoice was for.
      context: {
        placementId: links.placementId,
        jobRequisitionId: links.jobRequisitionId,
        sourceLeadId: links.sourceLeadId,
        immigrationCaseId: links.immigrationCaseId,
        ...(links.placementOverride
          ? { placementSecondInvoiceReason: links.placementOverride.reason }
          : {}),
        ...(data.idempotencyKey
          ? {
              idempotencyKey: data.idempotencyKey,
              payerMode: data.payerMode,
              payerId: data.payerId,
              invoiceNumber: invoice.number,
              engagementId: engagement.id,
              printPath,
            }
          : {}),
      },
    });

    return {
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      engagementId: engagement.id,
      printPath,
    };
  });
}

/**
 * Stage 6D Wave 1f, widened in Stage B Wave 1 (client P0) — look for a
 * plausible duplicate on the same payer + service. The original check
 * also matched on amount, which let a re-raise with any price change
 * through silently; the client-reported "duplicated invoice, amount
 * doubled" scenario is exactly that path. Now any live (ISSUED or
 * PARTIALLY_PAID) invoice for the same payer + service triggers the
 * warning regardless of amount; a fully-settled invoice still doesn't
 * inhibit a legitimate repeat sale.
 *
 * Join through `service_engagements` so the service-catalog identity
 * check lives on the engagement row (invoices themselves don't carry
 * the catalog FK directly — the engagement does).
 *
 * Returns the first live match (there may be more; the operator sees
 * one at a time, which is enough to prompt the override).
 */
async function findLiveDuplicateInvoice(
  tx: DbExecutor,
  args: {
    payerPersonId: string | null;
    payerEmployerId: string | null;
    serviceCatalogItemId: string;
    excludeOtherPlacementsThan?: string | null;
  },
): Promise<{ id: string; number: string; totalAmount: string; currencyCode: string } | null> {
  const payerClause = args.payerPersonId
    ? eq(invoices.payerPersonId, args.payerPersonId)
    : args.payerEmployerId
      ? eq(invoices.payerEmployerId, args.payerEmployerId)
      : null;
  if (!payerClause) return null;
  const rows = await tx
    .select({
      id: invoices.id,
      number: invoices.number,
      totalAmount: invoices.totalAmount,
      currencyCode: invoices.currencyCode,
    })
    .from(invoices)
    .innerJoin(serviceEngagements, eq(serviceEngagements.id, invoices.serviceEngagementId))
    .where(
      and(
        payerClause,
        eq(serviceEngagements.serviceCatalogItemId, args.serviceCatalogItemId),
        // Live (unpaid) invoices, plus — for employers — a recent PAID
        // invoice from an enquiry conversion: that money is already in, so
        // a fresh invoice for the same service would bill it twice.
        args.payerEmployerId
          ? or(
              inArray(invoices.status, ['ISSUED', 'PARTIALLY_PAID']),
              and(
                eq(invoices.status, 'PAID'),
                isNotNull(invoices.sourceLeadId),
                gte(invoices.issuedAt, sql`NOW() - INTERVAL '30 days'`),
              ),
            )
          : inArray(invoices.status, ['ISSUED', 'PARTIALLY_PAID']),
        args.excludeOtherPlacementsThan
          ? or(
              isNull(invoices.placementId),
              eq(invoices.placementId, args.excludeOtherPlacementsThan),
            )
          : undefined,
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

type InvoiceLinks = {
  immigrationCaseId: string | null;
  jobRequisitionId: string | null;
  placementId: string | null;
  sourceLeadId: string | null;
  placementOverride: { existingInvoiceId: string; reason: string } | null;
};

/**
 * Recruitment P0 — validate the optional cross-links before an invoice is
 * issued:
 *   - sourceLeadId: the lead exists and its payer is this invoice's payer
 *     (employer for Recruitment, person otherwise). An accepted lead's
 *     invoice is also linked to the requisition / case it became.
 *   - placementId: employer invoices only; the placement belongs to the
 *     payer employer and, when a requisition is given, to that
 *     requisition (it defaults to the placement's requisition). The
 *     placement row is locked so two concurrent raises serialize, and a
 *     second live (non-void) invoice for the same placement is refused
 *     unless an override reason is given (audited by the caller).
 *   - jobRequisitionId on an employer invoice belongs to that employer.
 */
async function resolveInvoiceLinks(
  tx: DbExecutor,
  data: GenerateInvoiceInput,
): Promise<InvoiceLinks> {
  const links: InvoiceLinks = {
    immigrationCaseId: data.immigrationCaseId ?? null,
    jobRequisitionId: data.jobRequisitionId ?? null,
    placementId: data.placementId ?? null,
    sourceLeadId: null,
    placementOverride: null,
  };

  if (data.sourceLeadId) {
    const [lead] = await tx
      .select({
        id: leads.id,
        targetBusiness: leads.targetBusiness,
        personId: leads.personId,
        employerId: leads.employerId,
        acceptedEntityId: leads.acceptedEntityId,
      })
      .from(leads)
      .where(eq(leads.id, data.sourceLeadId))
      .limit(1);
    if (!lead) throw new BusinessRuleError('LEAD_NOT_FOUND', 'The enquiry was not found.');
    const leadPayerMode = lead.targetBusiness === 'RECRUITMENT' ? 'EMPLOYER' : 'PERSON';
    const leadPayerId = leadPayerMode === 'EMPLOYER' ? lead.employerId : lead.personId;
    if (leadPayerMode !== data.payerMode || leadPayerId !== data.payerId) {
      throw new BusinessRuleError(
        'LEAD_PAYER_MISMATCH',
        "This invoice's payer is not the enquiry's payer.",
      );
    }
    links.sourceLeadId = lead.id;
    if (lead.acceptedEntityId) {
      if (lead.targetBusiness === 'RECRUITMENT' && !links.jobRequisitionId) {
        links.jobRequisitionId = lead.acceptedEntityId;
      }
      if (lead.targetBusiness === 'IMMIGRATION' && !links.immigrationCaseId) {
        links.immigrationCaseId = lead.acceptedEntityId;
      }
    }
  }

  if (data.placementId) {
    if (data.payerMode !== 'EMPLOYER') {
      throw new BusinessRuleError(
        'PLACEMENT_PAYER_MISMATCH',
        'A placement fee is invoiced to the employer.',
      );
    }
    const [placement] = await tx
      .select({
        id: placements.id,
        employerId: placements.employerId,
        jobRequisitionId: placements.jobRequisitionId,
      })
      .from(placements)
      .where(eq(placements.id, data.placementId))
      .for('update')
      .limit(1);
    if (!placement) throw new BusinessRuleError('PLACEMENT_NOT_FOUND', 'Placement not found.');
    if (placement.employerId !== data.payerId) {
      throw new BusinessRuleError(
        'PLACEMENT_PAYER_MISMATCH',
        'This placement belongs to a different employer.',
      );
    }
    if (links.jobRequisitionId && links.jobRequisitionId !== placement.jobRequisitionId) {
      throw new BusinessRuleError(
        'PLACEMENT_REQUISITION_MISMATCH',
        'This placement is on a different job requirement.',
      );
    }
    links.jobRequisitionId = placement.jobRequisitionId;

    const [already] = await tx
      .select({ id: invoices.id, number: invoices.number })
      .from(invoices)
      .where(and(eq(invoices.placementId, placement.id), ne(invoices.status, 'VOIDED')))
      .limit(1);
    if (already) {
      const reason = (data.overridePlacementInvoiceReason ?? '').trim();
      if (reason.length < 3) {
        throw new BusinessRuleError(
          'PLACEMENT_ALREADY_INVOICED',
          `This placement already has invoice ${already.number}. A second invoice would bill the employer twice for the same placement. Give a reason to confirm it is correct.`,
        );
      }
      links.placementOverride = { existingInvoiceId: already.id, reason };
    }
  }

  if (data.payerMode === 'EMPLOYER' && links.jobRequisitionId && !data.placementId) {
    const [req] = await tx
      .select({ employerId: jobRequisitions.employerId })
      .from(jobRequisitions)
      .where(eq(jobRequisitions.id, links.jobRequisitionId))
      .limit(1);
    if (!req || req.employerId !== data.payerId) {
      throw new BusinessRuleError(
        'REQUISITION_PAYER_MISMATCH',
        'This job requirement belongs to a different employer.',
      );
    }
  }

  return links;
}

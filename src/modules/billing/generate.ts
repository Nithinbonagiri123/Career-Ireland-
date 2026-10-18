import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { DbExecutor } from '@/lib/audit/withAudit';
import { recordAudit } from '@/lib/audit/withAudit';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { invoices } from '@/lib/db/schema/billing';
import { serviceEngagements } from '@/lib/db/schema/commerce';
import { employers } from '@/lib/db/schema/recruitment';
import { serviceCatalogItems, servicePackages } from '@/lib/db/schema/services';
import { BusinessRuleError, ValidationError } from '@/lib/errors';
import { insertEngagement } from '@/modules/commerce/repository';
import { fetchAppSettings } from '@/modules/settings/service';
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
  /** Stage 6D Wave 1f — operator-confirmed override for the duplicate-
      invoice detector. The server rejects a second invoice with the
      same payer + service + amount + currency where an ISSUED or
      PARTIALLY_PAID row already exists; the operator may re-submit with
      this flag set and a reason to override (e.g. legitimate repeat
      service in the same month). The flag + reason are audited on the
      new invoice row. */
  overrideDuplicateReason: z.string().max(500).nullish(),
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
  const session = await requireRole(['ADMIN', 'FINANCE']);
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

    // Engagement first — invoice references it. Agreed amount on the
    // engagement is stored as the total subtotal (qty × unit) for
    // downstream reporting; VAT lives only on the invoice row.
    const subtotalCents = Math.round(Number.parseFloat(data.unitPrice) * 100) * data.qty;
    const engagementAmount = (subtotalCents / 100).toFixed(2);

    // Stage 6D Wave 1f — duplicate-invoice detector. Finds any existing
    // invoice on the same payer + same service + same subtotal + same
    // currency that is still live (ISSUED or PARTIALLY_PAID). An
    // operator can legitimately repeat the service — the override flag
    // + reason let them proceed with an audit trail. Does not block
    // genuinely separate services (service id differs → no match) or
    // paid-off repeats (status filter excludes PAID).
    const existingDuplicate = await findLiveDuplicateInvoice(tx, {
      payerPersonId: data.payerMode === 'PERSON' ? data.payerId : null,
      payerEmployerId: data.payerMode === 'EMPLOYER' ? data.payerId : null,
      serviceCatalogItemId: service.id,
      subtotalCents,
      currencyCode: data.currencyCode,
    });
    if (existingDuplicate && !data.overrideDuplicateReason) {
      throw new BusinessRuleError(
        'DUPLICATE_INVOICE_LIKELY',
        `An unpaid invoice for the same service and amount already exists on this payer (${existingDuplicate.number}). Settle it first, cancel it, or re-submit with a reason explaining why a second invoice is correct.`,
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
      immigrationCaseId: data.immigrationCaseId ?? null,
      jobRequisitionId: data.jobRequisitionId ?? null,
      placementId: data.placementId ?? null,
    });
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
    });

    const printPath =
      data.payerMode === 'PERSON'
        ? `/candidates/${data.payerId}/invoices/${invoice.number}`
        : `/employers/${data.payerId}/invoices/${invoice.number}`;

    return {
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      engagementId: engagement.id,
      printPath,
    };
  });
}

/**
 * Stage 6D Wave 1f — look for a plausible duplicate on the same payer +
 * service + amount + currency. Matches only when the existing invoice
 * is still live (ISSUED or PARTIALLY_PAID) because a fully-settled
 * invoice doesn't inhibit a legitimate repeat sale of the same service.
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
    subtotalCents: number;
    currencyCode: string;
  },
): Promise<{ id: string; number: string } | null> {
  const payerClause = args.payerPersonId
    ? eq(invoices.payerPersonId, args.payerPersonId)
    : args.payerEmployerId
      ? eq(invoices.payerEmployerId, args.payerEmployerId)
      : null;
  if (!payerClause) return null;
  const subtotal = (args.subtotalCents / 100).toFixed(2);
  const rows = await tx
    .select({ id: invoices.id, number: invoices.number })
    .from(invoices)
    .innerJoin(serviceEngagements, eq(serviceEngagements.id, invoices.serviceEngagementId))
    .where(
      and(
        payerClause,
        eq(invoices.currencyCode, args.currencyCode),
        eq(serviceEngagements.serviceCatalogItemId, args.serviceCatalogItemId),
        inArray(invoices.status, ['ISSUED', 'PARTIALLY_PAID']),
        sql`${invoices.subtotal}::numeric = ${subtotal}::numeric`,
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

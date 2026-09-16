import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { recordAudit } from '@/lib/audit/withAudit';
import { requireInternalStaff } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
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
  const session = await requireInternalStaff();
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

    const lineDescription = data.lineDescription?.trim() || service.name;
    const invoice = await insertInvoice(tx, {
      payerPersonId: data.payerMode === 'PERSON' ? data.payerId : null,
      payerEmployerId: data.payerMode === 'EMPLOYER' ? data.payerId : null,
      serviceEngagementId: engagement.id,
      qty: data.qty,
      unitPrice: data.unitPrice,
      vatRatePercent: settings.vatRatePercent,
      currencyCode: data.currencyCode,
      lineDescription,
      issuedByUserId: session.user.id,
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
        vatRatePercent: settings.vatRatePercent,
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

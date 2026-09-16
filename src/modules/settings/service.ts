import { eq } from 'drizzle-orm';
import { cache } from 'react';
import { recordAudit } from '@/lib/audit/withAudit';
import { requirePermission, requireSession } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { APP_SETTINGS_ID, type AppSettings, appSettings } from '@/lib/db/schema/app_settings';
import { BusinessRuleError } from '@/lib/errors';

/**
 * Read/write helpers for the singleton `app_settings` row.
 *
 * Every printable (invoice, receipt, future letters) should read via
 * `fetchAppSettings()` — never import a hardcoded constant. See memory
 * `no-hardcoded-document-content` for the standing rule.
 *
 * `fetchAppSettings` is wrapped in React `cache()` so a single
 * dashboard/invoice render only hits the DB once even if multiple
 * server components request the settings independently.
 */

export const fetchAppSettings = cache(async (): Promise<AppSettings> => {
  const [row] = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.id, APP_SETTINGS_ID))
    .limit(1);
  if (!row) {
    // The migration seeds the singleton; if it's missing something
    // broke in the migration path — surface a clear error rather than
    // rendering `undefined` everywhere.
    throw new BusinessRuleError(
      'APP_SETTINGS_MISSING',
      'app_settings singleton row is missing — re-run pnpm db:migrate',
    );
  }
  return row;
});

/**
 * Shape of the editable fields — the admin form binds to this. `id`,
 * `createdAt`, `updatedAt`, `updatedByUserId` are managed by the DB /
 * this module and are never accepted from the client.
 */
export type UpdateAppSettingsInput = {
  legalName: string;
  fullLegalName: string;
  addressLines: string[];
  contactEmail: string;
  contactPhone: string | null;
  registrationNumber: string | null;
  vatNumber: string | null;
  bankName: string | null;
  bankAccountName: string | null;
  bankIban: string | null;
  bankBic: string | null;
  /** VAT percent as a numeric string with up to 2 decimals, e.g. "23.00". */
  vatRatePercent: string;
  invoiceFooter: string;
  receiptFooter: string;
};

export async function updateAppSettings(input: UpdateAppSettingsInput): Promise<AppSettings> {
  // Editing the letterhead touches every printable in the business —
  // ADMIN only, and audited. Gate is main.admin.manage rather than
  // .edit because this is a system-wide configuration change.
  const session = await requirePermission('main', 'admin', 'manage');
  return db.transaction(async (tx) => {
    const [before] = await tx
      .select()
      .from(appSettings)
      .where(eq(appSettings.id, APP_SETTINGS_ID))
      .limit(1);
    if (!before) {
      throw new BusinessRuleError(
        'APP_SETTINGS_MISSING',
        'app_settings singleton row is missing — re-run pnpm db:migrate',
      );
    }
    const [after] = await tx
      .update(appSettings)
      .set({
        legalName: input.legalName,
        fullLegalName: input.fullLegalName,
        addressLines: input.addressLines,
        contactEmail: input.contactEmail,
        contactPhone: input.contactPhone,
        registrationNumber: input.registrationNumber,
        vatNumber: input.vatNumber,
        bankName: input.bankName,
        bankAccountName: input.bankAccountName,
        bankIban: input.bankIban,
        bankBic: input.bankBic,
        vatRatePercent: input.vatRatePercent,
        invoiceFooter: input.invoiceFooter,
        receiptFooter: input.receiptFooter,
        updatedByUserId: session.user.id,
        updatedAt: new Date(),
      })
      .where(eq(appSettings.id, APP_SETTINGS_ID))
      .returning();
    if (!after) {
      throw new BusinessRuleError(
        'APP_SETTINGS_UPDATE_FAILED',
        'app_settings update returned no row',
      );
    }
    // Audit trail — the owner needs a record of every letterhead edit
    // because a changed VAT number or IBAN affects every subsequent
    // invoice / receipt reader.
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'app_settings',
      entityId: APP_SETTINGS_ID,
      action: 'UPDATED',
      before,
      after,
    });
    return after;
  });
}

/** Guard so any settings-reading server component fails-closed if unauth. */
export async function requireAppSettingsReader(): Promise<AppSettings> {
  await requireSession();
  return fetchAppSettings();
}

import { config } from 'dotenv';

config({ path: '.env.local' });

/**
 * One-shot cleanup: wipe the bracketed placeholder text I seeded into
 * app_settings in migration 0026. The owner flagged that live invoices
 * showed "Reg. no. [RBN — TBC]" and "VAT [VAT — not yet registered]" —
 * that's unprofessional and disqualifying.
 *
 * Values matching the exact placeholder strings are cleared to NULL so
 * the print pages hide the entire line (see the print-page conditional
 * rendering). Anything the owner has since typed by hand in
 * /admin/settings is left alone.
 *
 * Idempotent: re-running does nothing once the placeholders are gone.
 */

async function main() {
  const { eq, and } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const { appSettings, APP_SETTINGS_ID } = await import('../src/lib/db/schema/app_settings');

  const PLACEHOLDER_RBN = '[RBN — TBC]';
  const PLACEHOLDER_VAT = '[VAT — not yet registered]';

  const [before] = await db
    .select({
      registrationNumber: appSettings.registrationNumber,
      vatNumber: appSettings.vatNumber,
    })
    .from(appSettings)
    .where(eq(appSettings.id, APP_SETTINGS_ID))
    .limit(1);
  if (!before) {
    console.error('✗ app_settings row missing — run pnpm db:migrate first');
    process.exit(1);
  }

  let cleared = 0;
  if (before.registrationNumber === PLACEHOLDER_RBN) {
    await db
      .update(appSettings)
      .set({ registrationNumber: null })
      .where(
        and(
          eq(appSettings.id, APP_SETTINGS_ID),
          eq(appSettings.registrationNumber, PLACEHOLDER_RBN),
        ),
      );
    cleared++;
  }
  if (before.vatNumber === PLACEHOLDER_VAT) {
    await db
      .update(appSettings)
      .set({ vatNumber: null })
      .where(and(eq(appSettings.id, APP_SETTINGS_ID), eq(appSettings.vatNumber, PLACEHOLDER_VAT)));
    cleared++;
  }

  console.log(
    `\n✓ Placeholder cleanup complete — ${cleared} field${cleared === 1 ? '' : 's'} cleared`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error('\n✗', e instanceof Error ? e.message : String(e));
  process.exit(1);
});

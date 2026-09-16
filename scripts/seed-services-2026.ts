import { config } from 'dotenv';

config({ path: '.env.local' });

/**
 * Seed the July 2026 candidate service catalog per the pricing PDF
 * ("Unlock Your Future with Ireland Career Gateway").
 *
 * Each service has:
 *   - a catalog row (payerType = PERSON, isActive = true)
 *   - optional per-currency packages (service_packages) for dual pricing
 *
 * Services 1–3 have both EUR and ZAR packages so the operator picks
 * currency at invoice time. Service 4 (Work Permit) is "price on
 * enquiry" — no packages, admin enters the amount + currency manually
 * when generating the invoice.
 *
 * Idempotent — `ON CONFLICT DO NOTHING` on both catalog codes and
 * package (service+currency) tuples, so re-running the script leaves
 * existing rows untouched. Editing prices post-seed happens in the
 * admin UI, not by re-running this.
 */

type PackageSpec = { currency: 'EUR' | 'ZAR'; price: string };

type ServiceSpec = {
  code: string;
  name: string;
  /** Populated on the catalog row so legacy readers still get a
      sensible "default" if they don't drill into packages. */
  defaultCurrency: 'EUR' | 'ZAR' | null;
  defaultPrice: string | null;
  packages: PackageSpec[];
};

const SEED: ServiceSpec[] = [
  {
    code: 'INFO_SESSION',
    name: 'Info Session',
    defaultCurrency: 'EUR',
    defaultPrice: '25.00',
    packages: [
      { currency: 'EUR', price: '25.00' },
      { currency: 'ZAR', price: '250.00' },
    ],
  },
  {
    code: 'DIY_CONTACTS',
    name: 'DIY Contacts',
    defaultCurrency: 'EUR',
    defaultPrice: '50.00',
    packages: [
      { currency: 'EUR', price: '50.00' },
      { currency: 'ZAR', price: '500.00' },
    ],
  },
  {
    code: 'CV_COVER_LETTER',
    name: 'CV & Cover Letter',
    defaultCurrency: 'EUR',
    defaultPrice: '100.00',
    packages: [
      { currency: 'EUR', price: '100.00' },
      { currency: 'ZAR', price: '1500.00' },
    ],
  },
  {
    code: 'WORK_PERMIT_APPLICATION',
    name: 'Work Permit Registration & Visa (Ireland only)',
    defaultCurrency: null,
    defaultPrice: null,
    packages: [],
  },
];

async function main() {
  const { and, eq } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const { serviceCatalogItems, servicePackages } = await import('../src/lib/db/schema/services');

  let catalogInserted = 0;
  let catalogSkipped = 0;
  let packagesInserted = 0;
  let packagesSkipped = 0;

  for (const spec of SEED) {
    // Upsert catalog row (idempotent — unique on code).
    const [inserted] = await db
      .insert(serviceCatalogItems)
      .values({
        code: spec.code,
        name: spec.name,
        payerType: 'PERSON',
        isActive: true,
        defaultCurrencyCode: spec.defaultCurrency,
        defaultPrice: spec.defaultPrice,
      })
      .onConflictDoNothing({ target: serviceCatalogItems.code })
      .returning({ id: serviceCatalogItems.id });

    let catalogId: string;
    if (inserted) {
      catalogInserted++;
      catalogId = inserted.id;
    } else {
      catalogSkipped++;
      const [existing] = await db
        .select({ id: serviceCatalogItems.id })
        .from(serviceCatalogItems)
        .where(eq(serviceCatalogItems.code, spec.code))
        .limit(1);
      if (!existing) {
        console.error(`✗ ${spec.code}: insert skipped but row missing on lookup`);
        continue;
      }
      catalogId = existing.id;
    }

    for (const pkg of spec.packages) {
      // service_packages has no natural unique — check by
      // (serviceCatalogItemId, currencyCode) since we only want one
      // package per currency per service.
      const [existing] = await db
        .select({ id: servicePackages.id })
        .from(servicePackages)
        .where(
          and(
            eq(servicePackages.serviceCatalogItemId, catalogId),
            eq(servicePackages.currencyCode, pkg.currency),
          ),
        )
        .limit(1);
      if (existing) {
        packagesSkipped++;
        continue;
      }
      await db.insert(servicePackages).values({
        name: `${spec.name} (${pkg.currency})`,
        serviceCatalogItemId: catalogId,
        price: pkg.price,
        currencyCode: pkg.currency,
        isActive: true,
      });
      packagesInserted++;
    }
  }

  console.log('\n✓ 2026 services seed complete');
  console.log(`  catalog: ${catalogInserted} inserted, ${catalogSkipped} already present`);
  console.log(`  packages: ${packagesInserted} inserted, ${packagesSkipped} already present`);
  process.exit(0);
}

main().catch((e) => {
  console.error('\n✗', e instanceof Error ? e.message : String(e));
  process.exit(1);
});

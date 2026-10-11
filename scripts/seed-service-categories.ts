import { config } from 'dotenv';

// Load env BEFORE requiring anything that imports env.ts (validates process.env at import time).
config({ path: '.env.local' });

/**
 * Session 34 — seed the four starter business-line categories so a
 * fresh install isn't an empty dropdown. Idempotent — skips any slug
 * already present so re-runs after adding a new category by hand are
 * safe. Owners can edit / add / deactivate from /admin/service-categories.
 */
const STARTERS: Array<{
  slug: string;
  name: string;
  description: string;
  displayOrder: number;
}> = [
  {
    slug: 'candidate-services',
    name: 'Candidate Services',
    description: 'Services sold directly to the candidate (coaching, CV review, job search).',
    displayOrder: 10,
  },
  {
    slug: 'recruitment',
    name: 'Recruitment',
    description: 'Services sold to employer clients (placement fees, retainers, posting).',
    displayOrder: 20,
  },
  {
    slug: 'immigration',
    name: 'Immigration',
    description: 'Work-permit, visa and other immigration-casework fees.',
    displayOrder: 30,
  },
  {
    slug: 'other',
    name: 'Other',
    description: 'Anything that doesn’t fit the three main lines.',
    displayOrder: 99,
  },
];

async function main() {
  const { eq } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const { serviceCategories } = await import('../src/lib/db/schema/services');

  let inserted = 0;
  let skipped = 0;
  for (const row of STARTERS) {
    const [existing] = await db
      .select({ id: serviceCategories.id })
      .from(serviceCategories)
      .where(eq(serviceCategories.slug, row.slug))
      .limit(1);
    if (existing) {
      skipped += 1;
      continue;
    }
    await db.insert(serviceCategories).values({
      slug: row.slug,
      name: row.name,
      description: row.description,
      displayOrder: row.displayOrder,
      isActive: true,
    });
    inserted += 1;
  }

  console.log(`\n✓ Service categories seeded (${inserted} added, ${skipped} already present).`);
  process.exit(0);
}

main().catch((err) => {
  console.error('✗ seed-service-categories failed:', err);
  process.exit(1);
});

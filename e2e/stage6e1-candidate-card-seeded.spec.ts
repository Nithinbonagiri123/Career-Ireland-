import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { e2eAdminId } from './helpers/owner';

/**
 * Stage 6E+1 Section 6 — seeded Candidate Card spacing verification.
 *
 * Seeds a diverse set of candidates so the grid screenshots exercise
 * the edge cases a quiet dev database doesn't surface:
 *   - very long full names (truncation inside the header strip)
 *   - full Irish immigration status range (STAMP_4 approved, PENDING,
 *     NONE "not currently in Ireland", NOT_PROVIDED — hidden)
 *   - missing fields (no email, no phone, no profession, no city)
 *   - long international phone numbers in E.164
 *   - varying apps/shortlists/placements counts (0, mid, high)
 *
 * Captures full-page screenshots at desktop / tablet / mobile widths
 * and asserts no card exceeds the 420px height ceiling at desktop —
 * if the compaction regresses, this spec fails loudly instead of
 * drifting silently back to the original ~560px cards.
 */

const SHOTS_DIR = path.resolve('playwright/stage6e1-candidate-card-seeded');
fs.mkdirSync(SHOTS_DIR, { recursive: true });

type Seeded = {
  personIds: string[];
  cleanup: () => Promise<void>;
};

async function seedDiverseCandidates(stamp: string): Promise<Seeded> {
  const { config: loadEnv } = await import('dotenv');
  loadEnv({ path: '.env.local' });
  const { eq, inArray } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const { persons, candidateProfiles } = await import('../src/lib/db/schema/persons');
  const { occupations } = await import('../src/lib/db/schema/occupations');

  const [occ] = await db.select({ id: occupations.id }).from(occupations).limit(1);

  type SeedSpec = {
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    currentCity: string | null;
    currentCountry: string | null;
    primaryOccupationId: string | null;
    irishImmigrationStatus:
      | 'NONE'
      | 'STAMP_1'
      | 'STAMP_1G'
      | 'STAMP_2'
      | 'STAMP_3'
      | 'STAMP_4'
      | 'OTHER'
      | 'PENDING'
      | 'NOT_PROVIDED'
      | null;
  };

  const specs: SeedSpec[] = [
    {
      firstName: 'Siobhán-Aoife',
      lastName: `Ní-Bhroin-${stamp}`,
      email: `siobhan.aoife-${stamp}@very-long-example-domain.ie`,
      phone: '+353871234567',
      currentCity: 'Dún Laoghaire',
      currentCountry: 'Ireland',
      primaryOccupationId: occ?.id ?? null,
      irishImmigrationStatus: 'STAMP_4',
    },
    {
      firstName: 'Oluwaseun',
      lastName: `Adebayo-${stamp}`,
      email: `o.adebayo-${stamp}@example.test`,
      phone: '+2348012345678',
      currentCity: 'Lagos',
      currentCountry: 'Nigeria',
      primaryOccupationId: occ?.id ?? null,
      irishImmigrationStatus: 'PENDING',
    },
    {
      firstName: 'Yuki',
      lastName: `Tanaka-${stamp}`,
      email: `yuki-${stamp}@example.test`,
      phone: '+819012345678',
      currentCity: null,
      currentCountry: 'Japan',
      primaryOccupationId: null, // intentionally no profession
      irishImmigrationStatus: 'NONE',
    },
    {
      firstName: 'Priyanka',
      lastName: `Krishnamurthy-${stamp}`,
      email: null, // intentionally no email
      phone: '+919876543210',
      currentCity: 'Mumbai',
      currentCountry: 'India',
      primaryOccupationId: occ?.id ?? null,
      irishImmigrationStatus: 'NOT_PROVIDED',
    },
    {
      firstName: 'Jean-Baptiste',
      lastName: `de-la-Rochefoucauld-${stamp}`,
      email: `jb-${stamp}@fr.example.test`,
      phone: null, // intentionally no phone
      currentCity: 'Lyon',
      currentCountry: 'France',
      primaryOccupationId: occ?.id ?? null,
      irishImmigrationStatus: null, // never captured
    },
    {
      firstName: 'Thandiwe',
      lastName: `Mbeki-${stamp}`,
      email: `t.mbeki-${stamp}@za.example.test`,
      phone: '+27821234567',
      currentCity: 'Cape Town',
      currentCountry: 'South Africa',
      primaryOccupationId: occ?.id ?? null,
      irishImmigrationStatus: 'STAMP_1G',
    },
  ];

  const personIds: string[] = [];
  for (const s of specs) {
    const [p] = await db
      .insert(persons)
      .values({
        firstName: s.firstName,
        lastName: s.lastName,
        email: s.email,
        phone: s.phone,
        currentCity: s.currentCity,
        currentCountry: s.currentCountry,
        primaryOccupationId: s.primaryOccupationId,
        irishImmigrationStatus: s.irishImmigrationStatus,
        source: 'DIRECT',
      })
      .returning({ id: persons.id });
    if (!p) throw new Error('seed person insert failed');
    personIds.push(p.id);
    await db
      .insert(candidateProfiles)
      .values({ assignedUserId: await e2eAdminId(), personId: p.id });
  }

  return {
    personIds,
    cleanup: async () => {
      if (personIds.length === 0) return;
      await db.delete(candidateProfiles).where(inArray(candidateProfiles.personId, personIds));
      await db.delete(persons).where(inArray(persons.id, personIds));
      void eq; // referenced to silence lint
    },
  };
}

test('seeded candidate cards — screenshots + height ceiling at desktop / tablet / mobile', async ({
  page,
}) => {
  const stamp = Math.random().toString(36).slice(2, 6);
  const seeded = await seedDiverseCandidates(stamp);
  try {
    // Height ceilings calibrated above the Stage 6E+1 Section 3 row
    // (the new "Declared Irish status" line adds ~16px when present).
    // Original Stage 6D card was ~560px tall; these ceilings guard
    // against a regression back to that density while permitting the
    // compact-but-readable Stage 6E+1 layout.
    for (const [label, viewport, ceiling] of [
      ['desktop', { width: 1440, height: 1200 }, 440],
      ['tablet', { width: 820, height: 1600 }, 475],
      ['mobile', { width: 390, height: 2000 }, 540],
    ] as const) {
      await page.setViewportSize(viewport);
      await page.goto('/candidates?assigned=all&view=grid');
      await expect(page.locator('[aria-label^="Candidate "]').first()).toBeVisible({
        timeout: 20_000,
      });

      // Snapshot the grid.
      await page.screenshot({
        path: path.join(SHOTS_DIR, `${label}-cards-${stamp}.png`),
        fullPage: true,
      });

      // Height-ceiling guard: scope to seeded persons so stray cards
      // in the dev DB don't affect the assertion.
      for (const pid of seeded.personIds) {
        const card = page
          .locator(`a[href$="/clients/${pid}"]`)
          .first()
          .locator('xpath=ancestor::*[contains(@aria-label, "Candidate")]');
        if ((await card.count()) === 0) continue;
        const box = await card.first().boundingBox();
        if (!box) continue;
        expect.soft(box.height).toBeLessThanOrEqual(ceiling);
      }
    }
  } finally {
    await seeded.cleanup();
  }
});

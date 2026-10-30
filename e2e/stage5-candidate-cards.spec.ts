import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { e2eAdminId } from './helpers/owner';

/**
 * Stage 5 — Candidate Cards redesign verification.
 *
 * Seeds four candidates covering the required edge cases:
 *   1. Complete data: name, email, phone, occupation, immigration
 *      case with permit label + expiry, applications/shortlists/
 *      placements all > 0.
 *   2. Missing occupation: everything else intact; neutral placeholder
 *      shown instead of guessing.
 *   3. Missing immigration permission: no case on file.
 *   4. Long occupation name: 70+ chars, must truncate on a single
 *      line without breaking the card layout.
 *
 * Screenshots at desktop (1440×900) + mobile (390×844) widths land in
 * playwright/stage5-screenshots/.
 */

const SHOTS_DIR = path.resolve('playwright/stage5-screenshots');
fs.mkdirSync(SHOTS_DIR, { recursive: true });

type Seeded = {
  personId: string;
  profileId: string;
  firstName: string;
  cleanup: () => Promise<void>;
};

async function seedCandidate(args: {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  country: string | null;
  occupationName: string | null;
  withImmigration: boolean;
  immigrationApplicationTypeName?: string;
  /** Case status to insert — defaults to APPROVED with a future expiry so
   *  the card renders a CURRENT_PERMISSION state. SUBMITTED exercises the
   *  "Immigration case" neutral-label branch. */
  immigrationStatus?: 'APPROVED' | 'SUBMITTED';
  withApplicationsAndShortlist?: boolean;
}): Promise<Seeded> {
  const { config: loadEnv } = await import('dotenv');
  loadEnv({ path: '.env.local' });
  const { desc, eq } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const { candidateProfiles, persons } = await import('../src/lib/db/schema/persons');
  const { occupations } = await import('../src/lib/db/schema/occupations');
  const { immigrationApplicationTypes, immigrationCases } = await import(
    '../src/lib/db/schema/immigration'
  );
  const { employers, jobRequisitions, jobApplications, shortlistEntries, placements } =
    await import('../src/lib/db/schema/recruitment');
  const { users } = await import('../src/lib/db/schema/users');

  let occupationId: string | null = null;
  if (args.occupationName) {
    const [occ] = await db
      .select({ id: occupations.id })
      .from(occupations)
      .where(eq(occupations.name, args.occupationName))
      .limit(1);
    if (occ) {
      occupationId = occ.id;
    } else {
      // Dynamically create an occupation row for the test (e.g. the
      // long-name case). Needs a category — use the "Uncategorised"
      // row that the seed script creates. Flag inactive so it doesn't
      // pollute downstream pickers.
      const { occupationCategories } = await import('../src/lib/db/schema/occupations');
      let [cat] = await db
        .select({ id: occupationCategories.id })
        .from(occupationCategories)
        .limit(1);
      if (!cat) {
        // Fresh CI databases seed no occupation categories — create one.
        [cat] = await db
          .insert(occupationCategories)
          .values({ name: `E2E Category ${Date.now()}` })
          .returning({ id: occupationCategories.id });
      }
      if (!cat) throw new Error('no occupation_categories row to anchor seed');
      const [created] = await db
        .insert(occupations)
        .values({ name: args.occupationName, isActive: false, categoryId: cat.id })
        .returning({ id: occupations.id });
      if (!created) throw new Error('occupation insert failed');
      occupationId = created.id;
    }
  }

  const [p] = await db
    .insert(persons)
    .values({
      firstName: args.firstName,
      lastName: args.lastName,
      email: args.email,
      phone: args.phone,
      currentCity: args.city,
      currentCountry: args.country,
      source: 'DIRECT',
      primaryOccupationId: occupationId,
    })
    .returning({ id: persons.id });
  if (!p) throw new Error('person insert failed');

  const [u] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, 'e2e-admin@ireland-careers.test'))
    .limit(1);

  const [profile] = await db
    .insert(candidateProfiles)
    .values({
      personId: p.id,
      primaryOccupationId: occupationId,
      lifecycleStatus: 'ACTIVE',
      availabilityStatus: 'AVAILABLE',
      assignedUserId: u?.id ?? null,
    })
    .returning({ id: candidateProfiles.id });
  if (!profile) throw new Error('candidate_profile insert failed');

  let immigrationCaseId: string | null = null;
  if (args.withImmigration && args.immigrationApplicationTypeName) {
    const [existingType] = await db
      .select({ id: immigrationApplicationTypes.id })
      .from(immigrationApplicationTypes)
      .where(eq(immigrationApplicationTypes.name, args.immigrationApplicationTypeName))
      .limit(1);
    let typeId = existingType?.id ?? null;
    if (!typeId) {
      const [newType] = await db
        .insert(immigrationApplicationTypes)
        .values({
          name: args.immigrationApplicationTypeName,
          category: 'EMPLOYMENT_PERMIT',
          isActive: false,
        })
        .returning({ id: immigrationApplicationTypes.id });
      typeId = newType?.id ?? null;
    }
    const immStatus = args.immigrationStatus ?? 'APPROVED';
    const [newCase] = await db
      .insert(immigrationCases)
      .values({
        assignedUserId: await e2eAdminId(),
        caseType: 'EMPLOYMENT_PERMIT',
        applicationTypeId: typeId,
        beneficiaryPersonId: p.id,
        status: immStatus,
        // Only APPROVED cases carry a meaningful expiry — pending/submitted
        // ones leave it null so the card renders the neutral case headline
        // without an "expires" line.
        expiresOn: immStatus === 'APPROVED' ? '2027-06-30' : null,
      })
      .returning({ id: immigrationCases.id });
    immigrationCaseId = newCase?.id ?? null;
  }

  const createdApps: string[] = [];
  const createdSls: string[] = [];
  const createdPlacements: string[] = [];
  if (args.withApplicationsAndShortlist) {
    // Find or create a dummy requisition on any employer. We only need
    // enough to insert FK-valid child rows; keep them inactive so no
    // other list surfaces picks them up.
    const [emp] = await db.select({ id: employers.id }).from(employers).limit(1);
    if (emp) {
      const [req] = await db
        .select({ id: jobRequisitions.id })
        .from(jobRequisitions)
        .where(eq(jobRequisitions.employerId, emp.id))
        .orderBy(desc(jobRequisitions.createdAt))
        .limit(1);
      if (req) {
        const [sl] = await db
          .insert(shortlistEntries)
          .values({ jobRequisitionId: req.id, personId: p.id })
          .returning({ id: shortlistEntries.id });
        if (sl) createdSls.push(sl.id);

        const [app] = await db
          .insert(jobApplications)
          .values({
            jobRequisitionId: req.id,
            personId: p.id,
            source: 'INTERNAL',
          })
          .returning({ id: jobApplications.id });
        if (app) createdApps.push(app.id);

        const [pl] = await db
          .insert(placements)
          .values({
            jobRequisitionId: req.id,
            personId: p.id,
            jobApplicationId: app?.id ?? null,
            employerId: emp.id,
            status: 'PROPOSED',
          })
          .returning({ id: placements.id });
        if (pl) createdPlacements.push(pl.id);
      }
    }
  }

  const cleanup = async () => {
    const { eq } = await import('drizzle-orm');
    const { db } = await import('../src/lib/db/client');
    const { candidateProfiles, persons } = await import('../src/lib/db/schema/persons');
    const { immigrationCases } = await import('../src/lib/db/schema/immigration');
    const { placements, jobApplications, shortlistEntries } = await import(
      '../src/lib/db/schema/recruitment'
    );
    for (const id of createdPlacements) await db.delete(placements).where(eq(placements.id, id));
    for (const id of createdApps)
      await db.delete(jobApplications).where(eq(jobApplications.id, id));
    for (const id of createdSls)
      await db.delete(shortlistEntries).where(eq(shortlistEntries.id, id));
    if (immigrationCaseId) {
      await db.delete(immigrationCases).where(eq(immigrationCases.id, immigrationCaseId));
    }
    await db.delete(candidateProfiles).where(eq(candidateProfiles.id, profile.id));
    await db.delete(persons).where(eq(persons.id, p.id));
  };

  return { personId: p.id, profileId: profile.id, firstName: args.firstName, cleanup };
}

test.describe('Stage 5 — Candidate Cards', () => {
  test('four edge cases + desktop + mobile screenshots', async ({ page, browser }) => {
    const stamp = Math.random().toString(36).slice(2, 6);
    const seeded: Seeded[] = [];
    try {
      // 1. Complete data
      seeded.push(
        await seedCandidate({
          firstName: `S5Complete${stamp}`,
          lastName: 'Full',
          email: `s5-complete-${stamp}@example.test`,
          phone: '+353871234567',
          city: 'Dublin',
          country: 'Ireland',
          occupationName: 'Nurse',
          withImmigration: true,
          immigrationApplicationTypeName: 'Stamp 4',
          withApplicationsAndShortlist: true,
        }),
      );
      // 2. Missing occupation
      seeded.push(
        await seedCandidate({
          firstName: `S5NoOcc${stamp}`,
          lastName: 'Full',
          email: `s5-noocc-${stamp}@example.test`,
          phone: '+353871234568',
          city: 'Cork',
          country: 'Ireland',
          occupationName: null,
          withImmigration: true,
          immigrationApplicationTypeName: 'Critical Skills Work Permit',
        }),
      );
      // 3. Missing immigration permission
      seeded.push(
        await seedCandidate({
          firstName: `S5NoImm${stamp}`,
          lastName: 'Full',
          email: `s5-noimm-${stamp}@example.test`,
          phone: '+353871234569',
          city: 'Galway',
          country: 'Ireland',
          occupationName: 'Software Engineer',
          withImmigration: false,
        }),
      );
      // 4. Long occupation name
      const longName = 'Senior Specialist Clinical Research Nurse (Oncology, Phase II–III Trials)';
      seeded.push(
        await seedCandidate({
          firstName: `S5Long${stamp}`,
          lastName: 'Full',
          email: `s5-long-${stamp}@example.test`,
          phone: '+353871234570',
          city: 'Limerick',
          country: 'Ireland',
          occupationName: longName,
          withImmigration: true,
          immigrationApplicationTypeName: 'General Employment Permit',
        }),
      );
      // 5. Pending immigration case — must be rendered as a neutral
      //    "Immigration case" label, never as a currently-held permission.
      //    This is the Stage 5 regression: a SUBMITTED Stamp 4 case used
      //    to render with the permit name prominent and the status pill
      //    small, which could be misread as holding Stamp 4 today.
      seeded.push(
        await seedCandidate({
          firstName: `S5Pending${stamp}`,
          lastName: 'Full',
          email: `s5-pending-${stamp}@example.test`,
          phone: '+353871234571',
          city: 'Waterford',
          country: 'Ireland',
          occupationName: 'Chef',
          withImmigration: true,
          immigrationApplicationTypeName: 'Stamp 4',
          immigrationStatus: 'SUBMITTED',
        }),
      );

      await page.setViewportSize({ width: 1440, height: 900 });
      // Scope to the seeded candidates via search so screenshots focus
      // on the four cards + unrelated test data stays out of frame.
      await page.goto(`/candidates?assigned=all&view=grid&q=S5`);
      // The search box in the page uses the existing data-table filter.
      // Also just rely on the page rendering — the seeded candidates
      // are the newest four, so they land at the top of the grid.
      await expect(page.getByText(/No candidates yet|added/i).first()).toBeVisible({
        timeout: 15_000,
      });
      // Confirm each seeded candidate renders.
      await expect(page.getByText(`S5Complete${stamp} Full`)).toBeVisible();
      await expect(page.getByText(`S5NoOcc${stamp} Full`)).toBeVisible();
      await expect(page.getByText(`S5NoImm${stamp} Full`)).toBeVisible();
      await expect(page.getByText(`S5Long${stamp} Full`)).toBeVisible();
      await expect(page.getByText(`S5Pending${stamp} Full`)).toBeVisible();

      // Priority-order checks against the APPROVED Screen 03 card:
      // occupation under the name, single-column contact rows, the
      // Applications / Shortlists / Placed counter strip. The old
      // immigration block was deliberately parked by the redesign —
      // immigration detail lives on the workspace, so a pending case
      // can no longer be misread as a held permission from the list.
      const completeCard = page
        .locator('article, [aria-label]')
        .filter({
          hasText: `S5Complete${stamp} Full`,
        })
        .first();
      await expect(completeCard.getByText(/^Nurse$/)).toBeVisible();
      await expect(completeCard.getByText('Applications')).toBeVisible();
      await expect(completeCard.getByText('Shortlists')).toBeVisible();
      await expect(completeCard.getByText('Placed')).toBeVisible();
      await expect(completeCard.getByRole('link', { name: /open profile/i })).toBeVisible();

      // Missing-occupation card shows the neutral placeholder.
      const noOccCard = page
        .locator('article, [aria-label]')
        .filter({
          hasText: `S5NoOcc${stamp} Full`,
        })
        .first();
      await expect(noOccCard.getByText(/no profession set/i)).toBeVisible();

      // Long-occupation card truncates the title (no horizontal
      // overflow) — snapshot below covers the visual check.
      const longCard = page
        .locator('article, [aria-label]')
        .filter({
          hasText: `S5Long${stamp} Full`,
        })
        .first();
      await expect(longCard).toBeVisible();

      // Pending-case regression: the card must never present a pending
      // Stamp 4 application as a held permission. The approved card
      // omits immigration entirely, so assert the absence.
      const pendingCard = page
        .locator('article, [aria-label]')
        .filter({ hasText: `S5Pending${stamp} Full` })
        .first();
      await expect(pendingCard.getByText(/Stamp 4/i)).toHaveCount(0);
      await expect(pendingCard.getByText(/current permission/i)).toHaveCount(0);

      // Scroll the first seeded card into view so the screenshot
      // captures the grid rather than the hero + aurora backdrop.
      await completeCard.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await page.screenshot({
        path: path.join(SHOTS_DIR, 'desktop-grid.png'),
        fullPage: true,
      });

      // Mobile viewport pass.
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/candidates?assigned=all&view=grid`);
      // Wait for the first seeded card to be in the DOM AND scrolled
      // into view before the screenshot. Mobile layout stacks cards
      // vertically; the top header + sidebar banner take ~200px so the
      // card is just below the fold on initial paint.
      const mobileTopCard = page
        .locator('[aria-label^="Candidate "]')
        .filter({ hasText: `S5Complete${stamp} Full` })
        .first();
      await expect(mobileTopCard).toBeVisible({ timeout: 15_000 });
      await mobileTopCard.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await page.screenshot({
        path: path.join(SHOTS_DIR, 'mobile-grid.png'),
        fullPage: true,
      });
      // At 390px grid-cols-1 → cards stack. Spot-check the top card
      // takes the full width.
      const box = await mobileTopCard.boundingBox();
      if (box) {
        // Allow for some horizontal padding (16-32px on each side).
        expect(box.width).toBeGreaterThan(300);
      }

      // Reference `browser` to appease lint
      void browser;
    } finally {
      // Reverse order — children before parents.
      for (const s of [...seeded].reverse()) await s.cleanup();
    }
  });
});

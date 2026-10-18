import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * Stage 6G Screen 01 — Leads visual acceptance.
 *
 * Seeds a realistic cross-section of leads so the screenshot has the
 * same density as the approved mockup, then captures 1440 / 820 / 390
 * screenshots. Does NOT change any business logic; the seed only
 * creates persons + leads via direct inserts.
 */

const SHOTS_DIR = path.resolve('playwright/stage6g-screen01-leads');
fs.mkdirSync(SHOTS_DIR, { recursive: true });

async function dbModules() {
  const { config: loadEnv } = await import('dotenv');
  loadEnv({ path: '.env.local' });
  const { eq, inArray } = await import('drizzle-orm');
  const { db } = await import('../src/lib/db/client');
  const persons = await import('../src/lib/db/schema/persons');
  const leads = await import('../src/lib/db/schema/leads');
  const users = await import('../src/lib/db/schema/users');
  return {
    db,
    eq,
    inArray,
    schemas: { ...persons, ...leads, ...users },
  };
}

type LeadSeed = {
  firstName: string;
  lastName: string;
  phone: string;
  nationality: string;
  country: string;
  city: string;
  email: string;
  status: 'NEW' | 'CONTACTED' | 'AWAITING_PAYMENT' | 'CONVERTED' | 'LOST' | 'REJECTED' | 'EXPIRED';
};

const SEEDS: LeadSeed[] = [
  {
    firstName: 'George Mzukisi',
    lastName: 'Lugalo',
    phone: '+27 82 123 4567',
    nationality: 'South African',
    country: 'South Africa',
    city: 'Cape Town',
    email: 'georgelugalo@example.test',
    status: 'CONVERTED',
  },
  {
    firstName: 'Michael',
    lastName: 'David',
    phone: '+353 86 234 5678',
    nationality: 'Irish',
    country: 'Ireland',
    city: 'Dublin',
    email: 'michael.david@example.test',
    status: 'CONTACTED',
  },
  {
    firstName: 'Mark',
    lastName: 'Thomas',
    phone: '+1 415 345 6789',
    nationality: 'American',
    country: 'United States',
    city: 'San Francisco',
    email: 'mark.thomas@example.test',
    status: 'CONVERTED',
  },
  {
    firstName: 'Jagir',
    lastName: 'Murphy',
    phone: '+44 20 456 7890',
    nationality: 'British',
    country: 'United Kingdom',
    city: 'London',
    email: 'jagir.murphy@example.test',
    status: 'AWAITING_PAYMENT',
  },
  {
    firstName: 'Sydney',
    lastName: 'Mohra',
    phone: '+61 2 567 8901',
    nationality: 'Australian',
    country: 'Australia',
    city: 'Sydney',
    email: 'sydney.mohra@example.test',
    status: 'NEW',
  },
  {
    firstName: 'Jamal',
    lastName: 'Awosti',
    phone: '+234 1 678 9012',
    nationality: 'Nigerian',
    country: 'Nigeria',
    city: 'Lagos',
    email: 'jamal.awosti@example.test',
    status: 'CONTACTED',
  },
  {
    firstName: 'Rohan',
    lastName: 'Mehra',
    phone: '+91 22 789 0123',
    nationality: 'Indian',
    country: 'India',
    city: 'Mumbai',
    email: 'rohan.mehra@example.test',
    status: 'AWAITING_PAYMENT',
  },
  {
    firstName: 'Priya',
    lastName: 'Chen',
    phone: '+86 10 890 1234',
    nationality: 'Chinese',
    country: 'China',
    city: 'Beijing',
    email: 'priya.chen@example.test',
    status: 'CONVERTED',
  },
];

test('stage 6G — Leads page screenshots (BEFORE/AFTER acceptance)', async ({ page }) => {
  const stamp = Math.random().toString(36).slice(2, 6);
  const m = await dbModules();
  const createdPersonIds: string[] = [];
  const createdLeadIds: string[] = [];
  try {
    for (const s of SEEDS) {
      const [p] = await m.db
        .insert(m.schemas.persons)
        .values({
          firstName: s.firstName,
          lastName: `${s.lastName}-${stamp}`,
          email: `${s.email.replace('@', `-${stamp}@`)}`,
          phone: s.phone,
          nationality: s.nationality,
          currentCountry: s.country,
          currentCity: s.city,
          source: 'DIRECT',
        })
        .returning({ id: m.schemas.persons.id });
      if (!p) throw new Error('person seed failed');
      createdPersonIds.push(p.id);
      const [lead] = await m.db
        .insert(m.schemas.leads)
        .values({
          personId: p.id,
          targetBusiness: 'CANDIDATE_SERVICES',
          status: s.status,
        })
        .returning({ id: m.schemas.leads.id });
      if (!lead) throw new Error('lead seed failed');
      createdLeadIds.push(lead.id);
    }

    for (const [label, viewport] of [
      ['desktop', { width: 1440, height: 900 }],
      ['tablet', { width: 820, height: 1180 }],
      ['mobile', { width: 390, height: 844 }],
    ] as const) {
      await page.setViewportSize(viewport);
      await page.goto('/leads?assigned=all');
      await expect(page.getByRole('heading', { name: /^Leads$/i })).toBeVisible({
        timeout: 15_000,
      });
      // Wait briefly for any Framer-Motion entrance to settle so the
      // screenshot captures the final layout.
      await page.waitForTimeout(500);
      await page.screenshot({
        path: path.join(SHOTS_DIR, `${label}-${stamp}.png`),
        fullPage: true,
      });
    }
  } finally {
    if (createdLeadIds.length > 0) {
      await m.db.delete(m.schemas.leads).where(m.inArray(m.schemas.leads.id, createdLeadIds));
    }
    if (createdPersonIds.length > 0) {
      await m.db.delete(m.schemas.persons).where(m.inArray(m.schemas.persons.id, createdPersonIds));
    }
  }
});

import { and, desc, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import type { DbExecutor } from '@/lib/audit/withAudit';
import { db } from '@/lib/db/client';
import { communicationLogs, tasks } from '@/lib/db/schema/activities';
import { invoices, receipts } from '@/lib/db/schema/billing';
import { recruitmentProspects } from '@/lib/db/schema/campaigns';
import {
  candidateQualifications,
  candidateSkills,
  employmentHistory,
} from '@/lib/db/schema/candidate_details';
import { serviceEngagements } from '@/lib/db/schema/commerce';
import { candidateDocumentRequirements, documentInstances } from '@/lib/db/schema/documents';
import { candidateEmailAccounts } from '@/lib/db/schema/email_accounts';
import { immigrationCases } from '@/lib/db/schema/immigration';
import { leads } from '@/lib/db/schema/leads';
import { candidateProfiles, type NewPerson, type Person, persons } from '@/lib/db/schema/persons';
import {
  candidateMatches,
  employerContacts,
  jobApplications,
  placements,
  shortlistEntries,
} from '@/lib/db/schema/recruitment';

export async function listActivePersons(): Promise<Person[]> {
  return db
    .select()
    .from(persons)
    .where(
      and(
        eq(persons.isDraft, false),
        isNull(persons.archivedAt),
        isNull(persons.mergedIntoPersonId),
      ),
    )
    .orderBy(desc(persons.createdAt));
}

export async function listAllPersonsIncludingMerged(): Promise<Person[]> {
  return db.select().from(persons).orderBy(desc(persons.createdAt));
}

export async function listMergedPersons(): Promise<
  Array<Person & { survivorName: string | null }>
> {
  const survivor = { as: 'survivor' };
  void survivor;
  const rows = await db
    .select()
    .from(persons)
    .where(isNotNull(persons.mergedIntoPersonId))
    .orderBy(desc(persons.mergedAt ?? persons.createdAt));
  const survivorIds = Array.from(
    new Set(rows.map((r) => r.mergedIntoPersonId).filter((x): x is string => !!x)),
  );
  const survivorMap = new Map<string, string>();
  if (survivorIds.length > 0) {
    const svrs = await db.select().from(persons).where(inArray(persons.id, survivorIds));
    for (const s of svrs) survivorMap.set(s.id, `${s.firstName} ${s.lastName}`);
  }
  return rows.map((r) => ({
    ...r,
    survivorName: r.mergedIntoPersonId ? (survivorMap.get(r.mergedIntoPersonId) ?? null) : null,
  }));
}

export async function insertPerson(tx: DbExecutor, input: NewPerson): Promise<Person> {
  const [row] = await tx.insert(persons).values(input).returning();
  if (!row) throw new Error('person insert returned no row');
  return row;
}

export async function getPerson(id: string): Promise<Person | null> {
  const [row] = await db.select().from(persons).where(eq(persons.id, id)).limit(1);
  return row ?? null;
}

// ─── Similar-person detection (existing code below unchanged) ────────

type SimilarInput = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  dateOfBirth?: string | null;
};

export type SimilarMatch = {
  person: Person;
  score: number;
  reasons: string[];
};

export async function findSimilarPersons(input: SimilarInput): Promise<SimilarMatch[]> {
  const conditions = [] as ReturnType<typeof or>[];
  const nEmail = input.email?.trim().toLowerCase();
  const nPhone = input.phone?.replace(/[^0-9+]/g, '');
  if (nEmail) conditions.push(eq(persons.normalizedEmail, nEmail));
  if (nPhone) conditions.push(eq(persons.normalizedPhone, nPhone));
  if (input.firstName && input.lastName) {
    conditions.push(
      and(
        eq(persons.firstName, input.firstName.trim()),
        eq(persons.lastName, input.lastName.trim()),
      ),
    );
  }
  if (conditions.length === 0) return [];
  const rows = await db
    .select()
    .from(persons)
    .where(and(isNull(persons.mergedIntoPersonId), isNull(persons.archivedAt), or(...conditions)));

  return rows
    .map((p) => {
      const reasons: string[] = [];
      let score = 0;
      if (nEmail && p.normalizedEmail === nEmail) {
        reasons.push('email');
        score += 3;
      }
      if (nPhone && p.normalizedPhone === nPhone) {
        reasons.push('phone');
        score += 2;
      }
      if (
        input.firstName &&
        input.lastName &&
        p.firstName === input.firstName.trim() &&
        p.lastName === input.lastName.trim()
      ) {
        reasons.push('name');
        score += 1;
      }
      return { person: p, score, reasons };
    })
    .filter((m) => m.reasons.length > 0)
    .sort((a, b) => b.score - a.score);
}

/**
 * Merge loser into survivor.
 *
 * Repoints every table that references `persons.id` from the loser to
 * the survivor. Tables fall into three shapes:
 *
 * 1. **Single-column UNIQUE on person_id** (candidate_profiles):
 *    If the survivor already owns a row, we delete the loser's row —
 *    audit trail is preserved via the loser person's `mergedIntoPersonId`
 *    pointer, and the survivor's profile is the source of truth going
 *    forward.
 *
 * 2. **Composite UNIQUE on (person_id, X)** (candidate_skills,
 *    candidate_qualifications, candidate_document_requirements,
 *    recruitment_prospects, candidate_matches): delete any loser rows
 *    that would collide with an existing survivor row on the composite
 *    key, then repoint the remainder.
 *
 * 3. **No unique constraint** (everything else): straight `UPDATE
 *    ... SET person_id = survivor WHERE person_id = loser`.
 *
 * Runs inside a single tx so partial failures roll back.
 *
 * Extend this function when you add a new table that references
 * `persons.id` — do NOT create parallel merges.
 */
export async function mergePersonRecords(
  tx: DbExecutor,
  loserId: string,
  survivorId: string,
): Promise<void> {
  // Shape 1 — single-column UNIQUE on person_id.
  const [survivorProfile] = await tx
    .select({ id: candidateProfiles.id })
    .from(candidateProfiles)
    .where(eq(candidateProfiles.personId, survivorId))
    .limit(1);
  if (survivorProfile) {
    await tx.delete(candidateProfiles).where(eq(candidateProfiles.personId, loserId));
  } else {
    await tx
      .update(candidateProfiles)
      .set({ personId: survivorId })
      .where(eq(candidateProfiles.personId, loserId));
  }

  // Shape 2 — composite UNIQUE. `DELETE ... WHERE person_id = loser AND
  // <other cols> IN (SELECT ... FROM survivor's rows)` clears collisions,
  // then a plain UPDATE moves the rest across.
  await tx.execute(sql`
    DELETE FROM ${candidateSkills}
    WHERE person_id = ${loserId}
      AND skill_id IN (
        SELECT skill_id FROM ${candidateSkills} WHERE person_id = ${survivorId}
      )
  `);
  await tx
    .update(candidateSkills)
    .set({ personId: survivorId })
    .where(eq(candidateSkills.personId, loserId));

  await tx.execute(sql`
    DELETE FROM ${candidateQualifications}
    WHERE person_id = ${loserId}
      AND qualification_id IN (
        SELECT qualification_id FROM ${candidateQualifications} WHERE person_id = ${survivorId}
      )
  `);
  await tx
    .update(candidateQualifications)
    .set({ personId: survivorId })
    .where(eq(candidateQualifications.personId, loserId));

  await tx.execute(sql`
    DELETE FROM ${candidateDocumentRequirements}
    WHERE person_id = ${loserId}
      AND document_type_id IN (
        SELECT document_type_id FROM ${candidateDocumentRequirements} WHERE person_id = ${survivorId}
      )
  `);
  await tx
    .update(candidateDocumentRequirements)
    .set({ personId: survivorId })
    .where(eq(candidateDocumentRequirements.personId, loserId));

  await tx.execute(sql`
    DELETE FROM ${recruitmentProspects}
    WHERE person_id = ${loserId}
      AND advertisement_id IN (
        SELECT advertisement_id FROM ${recruitmentProspects} WHERE person_id = ${survivorId}
      )
  `);
  await tx
    .update(recruitmentProspects)
    .set({ personId: survivorId })
    .where(eq(recruitmentProspects.personId, loserId));

  await tx.execute(sql`
    DELETE FROM ${candidateMatches}
    WHERE person_id = ${loserId}
      AND job_requisition_id IN (
        SELECT job_requisition_id FROM ${candidateMatches} WHERE person_id = ${survivorId}
      )
  `);
  await tx
    .update(candidateMatches)
    .set({ personId: survivorId })
    .where(eq(candidateMatches.personId, loserId));

  // Shape 3 — no composite unique, straight repoint.
  await tx.update(leads).set({ personId: survivorId }).where(eq(leads.personId, loserId));
  await tx
    .update(candidateEmailAccounts)
    .set({ personId: survivorId })
    .where(eq(candidateEmailAccounts.personId, loserId));
  await tx
    .update(employmentHistory)
    .set({ personId: survivorId })
    .where(eq(employmentHistory.personId, loserId));
  await tx
    .update(documentInstances)
    .set({ ownerPersonId: survivorId })
    .where(eq(documentInstances.ownerPersonId, loserId));
  await tx
    .update(immigrationCases)
    .set({ beneficiaryPersonId: survivorId })
    .where(eq(immigrationCases.beneficiaryPersonId, loserId));
  await tx
    .update(shortlistEntries)
    .set({ personId: survivorId })
    .where(eq(shortlistEntries.personId, loserId));
  await tx
    .update(jobApplications)
    .set({ personId: survivorId })
    .where(eq(jobApplications.personId, loserId));
  await tx.update(placements).set({ personId: survivorId }).where(eq(placements.personId, loserId));
  await tx
    .update(employerContacts)
    .set({ personId: survivorId })
    .where(eq(employerContacts.personId, loserId));
  await tx
    .update(serviceEngagements)
    .set({ payerPersonId: survivorId })
    .where(eq(serviceEngagements.payerPersonId, loserId));
  await tx
    .update(serviceEngagements)
    .set({ beneficiaryPersonId: survivorId })
    .where(eq(serviceEngagements.beneficiaryPersonId, loserId));
  await tx
    .update(invoices)
    .set({ payerPersonId: survivorId })
    .where(eq(invoices.payerPersonId, loserId));
  await tx
    .update(receipts)
    .set({ payerPersonId: survivorId })
    .where(eq(receipts.payerPersonId, loserId));
  await tx
    .update(communicationLogs)
    .set({ personId: survivorId })
    .where(eq(communicationLogs.personId, loserId));
  await tx.update(tasks).set({ personId: survivorId }).where(eq(tasks.personId, loserId));

  // Finally, mark the loser as merged. This survives on purpose so the
  // audit trail (before/after person state) is queryable.
  await tx
    .update(persons)
    .set({ mergedIntoPersonId: survivorId, mergedAt: new Date() })
    .where(eq(persons.id, loserId));
}

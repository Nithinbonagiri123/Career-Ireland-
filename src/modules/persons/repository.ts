import { and, desc, eq, isNotNull, isNull, or, sql } from 'drizzle-orm';
import type { DbExecutor } from '@/lib/audit/withAudit';
import { db } from '@/lib/db/client';
import { leads } from '@/lib/db/schema/leads';
import { candidateProfiles, type NewPerson, type Person, persons } from '@/lib/db/schema/persons';

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
    .orderBy(desc(persons.mergedAt));
  // Batch lookup for survivor names — small volumes.
  const survivorIds = Array.from(
    new Set(rows.map((r) => r.mergedIntoPersonId).filter((x): x is string => !!x)),
  );
  const survivorMap = new Map<string, string>();
  if (survivorIds.length) {
    const s = await db.select().from(persons);
    for (const p of s) survivorMap.set(p.id, `${p.firstName} ${p.lastName}`);
  }
  return rows.map((r) => ({
    ...r,
    survivorName: r.mergedIntoPersonId ? (survivorMap.get(r.mergedIntoPersonId) ?? null) : null,
  }));
}

export async function getPerson(id: string): Promise<Person | null> {
  const [row] = await db.select().from(persons).where(eq(persons.id, id)).limit(1);
  return row ?? null;
}

export async function insertPerson(tx: DbExecutor, data: NewPerson): Promise<Person> {
  // Never set normalizedEmail/normalizedPhone — Postgres has them as GENERATED ALWAYS
  // columns computed from email/phone. Any attempt to set them explicitly will error.
  const { normalizedEmail: _ne, normalizedPhone: _np, ...safe } = data;
  const [row] = await tx.insert(persons).values(safe).returning();
  if (!row) throw new Error('persons insert returned no row');
  return row;
}

export type SimilarMatch = {
  person: Person;
  reasons: Array<'EXACT_EMAIL' | 'EXACT_PHONE' | 'NAME_MATCH'>;
  score: number;
};

export async function findSimilarPersons(input: {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
}): Promise<SimilarMatch[]> {
  const emailNorm = input.email?.trim().toLowerCase() || null;
  const phoneNorm = input.phone?.replace(/[^0-9+]/g, '') || null;

  const conditions = [
    emailNorm ? eq(persons.normalizedEmail, emailNorm) : undefined,
    phoneNorm ? eq(persons.normalizedPhone, phoneNorm) : undefined,
    and(
      sql`lower(${persons.firstName}) = ${input.firstName.toLowerCase()}`,
      sql`lower(${persons.lastName}) = ${input.lastName.toLowerCase()}`,
    ),
  ].filter(Boolean);

  const candidates = await db
    .select()
    .from(persons)
    .where(and(isNull(persons.mergedIntoPersonId), isNull(persons.archivedAt), or(...conditions)))
    .limit(20);

  return candidates
    .map((person) => {
      const reasons: SimilarMatch['reasons'] = [];
      let score = 0;
      if (emailNorm && person.normalizedEmail === emailNorm) {
        reasons.push('EXACT_EMAIL');
        score += 50;
      }
      if (phoneNorm && person.normalizedPhone === phoneNorm) {
        reasons.push('EXACT_PHONE');
        score += 40;
      }
      if (
        person.firstName.toLowerCase() === input.firstName.toLowerCase() &&
        person.lastName.toLowerCase() === input.lastName.toLowerCase()
      ) {
        reasons.push('NAME_MATCH');
        score += 20;
      }
      return { person, reasons, score };
    })
    .filter((m) => m.reasons.length > 0)
    .sort((a, b) => b.score - a.score);
}

/**
 * Merge loser into survivor: repoint all FK-holding tables + set merged pointer.
 * Extend this function when new tables reference persons — do not create parallel merges.
 */
export async function mergePersonRecords(
  tx: DbExecutor,
  loserId: string,
  survivorId: string,
): Promise<void> {
  await tx.update(leads).set({ personId: survivorId }).where(eq(leads.personId, loserId));
  await tx
    .update(candidateProfiles)
    .set({ personId: survivorId })
    .where(eq(candidateProfiles.personId, loserId));
  await tx
    .update(persons)
    .set({ mergedIntoPersonId: survivorId, mergedAt: new Date() })
    .where(eq(persons.id, loserId));
}

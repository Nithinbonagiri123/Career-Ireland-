import { eq, sql } from 'drizzle-orm';
import { recordAudit } from '@/lib/audit/withAudit';
import { requireInternalStaff, requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { type Person, persons } from '@/lib/db/schema/persons';
import { BusinessRuleError, ValidationError } from '@/lib/errors';
import {
  findSimilarPersons,
  getPerson,
  insertPerson,
  listActivePersons,
  listMergedPersons,
  mergePersonRecords,
  type SimilarMatch,
} from './repository';
import {
  type ArchivePersonInput,
  ArchivePersonSchema,
  type CreatePersonInput,
  CreatePersonSchema,
  type FindSimilarInput,
  FindSimilarSchema,
  type MergePersonsInput,
  MergePersonsSchema,
  type UnarchivePersonInput,
  UnarchivePersonSchema,
} from './schemas';

/** Blank/empty-string → null for optional columns. */
function blankToNull<T extends string | undefined>(v: T): string | null {
  return v && v.trim().length > 0 ? v : null;
}

export async function fetchPersons(): Promise<Person[]> {
  await requireInternalStaff();
  return listActivePersons();
}

export async function fetchMergedPersons() {
  await requireRole(['ADMIN']);
  return listMergedPersons();
}

export async function fetchPerson(id: string): Promise<Person | null> {
  await requireInternalStaff();
  return getPerson(id);
}

export async function checkSimilarPersons(input: FindSimilarInput): Promise<SimilarMatch[]> {
  await requireInternalStaff();
  const parsed = FindSimilarSchema.parse(input);
  return findSimilarPersons(parsed);
}

export async function createPerson(input: CreatePersonInput): Promise<Person> {
  const session = await requireInternalStaff();
  const parsed = CreatePersonSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(
      'Invalid person data',
      parsed.error.flatten().fieldErrors as Record<string, string>,
    );
  }
  const data = parsed.data;

  return db.transaction(async (tx) => {
    const created = await insertPerson(tx, {
      firstName: data.firstName.trim(),
      lastName: data.lastName.trim(),
      email: blankToNull(data.email),
      phone: blankToNull(data.phone),
      dateOfBirth: blankToNull(data.dateOfBirth),
      nationality: blankToNull(data.nationality),
      currentCountry: blankToNull(data.currentCountry),
      currentCity: blankToNull(data.currentCity),
      source: data.source,
      notes: blankToNull(data.notes),
    });
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'person',
      entityId: created.id,
      action: 'CREATED',
      after: {
        firstName: created.firstName,
        lastName: created.lastName,
        email: created.email,
        source: created.source,
      },
    });
    return created;
  });
}

/**
 * Merge two person records. Loser's leads/candidate profile get repointed to survivor,
 * loser gets a merged_into pointer + timestamp. Never mutates historical audit rows.
 */
export async function mergePersons(input: MergePersonsInput): Promise<Person> {
  const session = await requireRole(['ADMIN']);
  const parsed = MergePersonsSchema.parse(input);

  if (parsed.loserPersonId === parsed.survivorPersonId) {
    throw new BusinessRuleError('CANNOT_MERGE_SELF', 'Cannot merge a person with themselves');
  }

  return db.transaction(async (tx) => {
    const loser = await getPerson(parsed.loserPersonId);
    const survivor = await getPerson(parsed.survivorPersonId);
    if (!loser || !survivor) {
      throw new BusinessRuleError('PERSON_NOT_FOUND', 'One of the persons was not found');
    }
    if (loser.mergedIntoPersonId) {
      throw new BusinessRuleError(
        'ALREADY_MERGED',
        'The loser person has already been merged before',
      );
    }

    await mergePersonRecords(tx, parsed.loserPersonId, parsed.survivorPersonId);

    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'person',
      entityId: parsed.loserPersonId,
      action: 'MERGED_INTO',
      before: { mergedIntoPersonId: null },
      after: { mergedIntoPersonId: parsed.survivorPersonId },
      context: { reason: parsed.reason, survivorPersonId: parsed.survivorPersonId },
    });

    const survivorAfter = await getPerson(parsed.survivorPersonId);
    if (!survivorAfter) throw new Error('survivor missing post-merge');
    return survivorAfter;
  });
}

/** Soft-archive a person. List queries filter archived rows out; the record itself is untouched. */
export async function archivePerson(input: ArchivePersonInput): Promise<Person> {
  const session = await requireInternalStaff();
  const parsed = ArchivePersonSchema.parse(input);
  return db.transaction(async (tx) => {
    const before = await getPerson(parsed.personId);
    if (!before) throw new BusinessRuleError('PERSON_NOT_FOUND', 'Person not found');
    if (before.archivedAt) {
      throw new BusinessRuleError('ALREADY_ARCHIVED', 'Person is already archived');
    }
    if (before.mergedIntoPersonId) {
      throw new BusinessRuleError('CANNOT_ARCHIVE_MERGED', 'Merged persons cannot be archived');
    }
    const [after] = await tx
      .update(persons)
      .set({
        archivedAt: new Date(),
        archivedByUserId: session.user.id,
        updatedAt: sql`NOW()`,
      })
      .where(eq(persons.id, parsed.personId))
      .returning();
    if (!after) throw new Error('archive returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'person',
      entityId: after.id,
      action: 'ARCHIVED',
      before: { archivedAt: null },
      after: { archivedAt: after.archivedAt },
      context: { reason: parsed.reason },
    });
    return after;
  });
}

/** Restore a previously archived person back to the active list. */
export async function unarchivePerson(input: UnarchivePersonInput): Promise<Person> {
  const session = await requireInternalStaff();
  const parsed = UnarchivePersonSchema.parse(input);
  return db.transaction(async (tx) => {
    const before = await getPerson(parsed.personId);
    if (!before) throw new BusinessRuleError('PERSON_NOT_FOUND', 'Person not found');
    if (!before.archivedAt) {
      throw new BusinessRuleError('NOT_ARCHIVED', 'Person is not archived');
    }
    const [after] = await tx
      .update(persons)
      .set({
        archivedAt: null,
        archivedByUserId: null,
        updatedAt: sql`NOW()`,
      })
      .where(eq(persons.id, parsed.personId))
      .returning();
    if (!after) throw new Error('unarchive returned no row');
    await recordAudit(tx, {
      actorUserId: session.user.id,
      entityType: 'person',
      entityId: after.id,
      action: 'UNARCHIVED',
      before: { archivedAt: before.archivedAt },
      after: { archivedAt: null },
      context: { reason: parsed.reason },
    });
    return after;
  });
}

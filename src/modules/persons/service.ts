import { recordAudit } from '@/lib/audit/withAudit';
import { requireRole } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import type { Person } from '@/lib/db/schema/persons';
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
  type CreatePersonInput,
  CreatePersonSchema,
  type FindSimilarInput,
  FindSimilarSchema,
  type MergePersonsInput,
  MergePersonsSchema,
} from './schemas';

/** Blank/empty-string → null for optional columns. */
function blankToNull<T extends string | undefined>(v: T): string | null {
  return v && v.trim().length > 0 ? v : null;
}

export async function fetchPersons(): Promise<Person[]> {
  await requireRole(['ADMIN', 'STAFF']);
  return listActivePersons();
}

export async function fetchMergedPersons() {
  await requireRole(['ADMIN']);
  return listMergedPersons();
}

export async function fetchPerson(id: string): Promise<Person | null> {
  await requireRole(['ADMIN', 'STAFF']);
  return getPerson(id);
}

export async function checkSimilarPersons(input: FindSimilarInput): Promise<SimilarMatch[]> {
  await requireRole(['ADMIN', 'STAFF']);
  const parsed = FindSimilarSchema.parse(input);
  return findSimilarPersons(parsed);
}

export async function createPerson(input: CreatePersonInput): Promise<Person> {
  const session = await requireRole(['ADMIN', 'STAFF']);
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

import { and, asc, desc, eq, ilike, isNull, or, type SQL, sql } from 'drizzle-orm';
import { z } from 'zod';
import { requireInternalStaff } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { persons } from '@/lib/db/schema/persons';
import { employers } from '@/lib/db/schema/recruitment';
import { ValidationError } from '@/lib/errors';

/**
 * R2 — server-side searchable, paginated pickers. Replaces shipping every
 * person / employer to the browser just to fill a dialog. Same access rule
 * as the lists they replace (fetchPersons / fetchEmployers: internal staff)
 * and the same row filters, so nobody sees records they could not see
 * before.
 */

export const PICKER_PAGE_SIZE = 20;

const PickerQuerySchema = z.object({
  query: z.string().max(100).default(''),
  page: z.number().int().min(0).max(500).default(0),
  pageSize: z.number().int().min(1).max(50).default(PICKER_PAGE_SIZE),
});
export type PickerQuery = z.input<typeof PickerQuerySchema>;
export type PickerPage<T> = { items: T[]; hasMore: boolean; page: number };

function parse(input: PickerQuery) {
  const r = PickerQuerySchema.safeParse(input);
  if (!r.success) throw new ValidationError('Invalid search');
  return { ...r.data, query: r.data.query.trim() };
}

/** Escape LIKE wildcards so a typed % or _ matches literally. */
function likeTerm(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export type PersonPickerItem = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
};

/** Active candidates (same filter as listActivePersons), newest first. */
export async function searchPersonsForPicker(
  input: PickerQuery,
): Promise<PickerPage<PersonPickerItem>> {
  await requireInternalStaff();
  const { query, page, pageSize } = parse(input);
  const conds: SQL[] = [
    eq(persons.isDraft, false),
    isNull(persons.archivedAt),
    isNull(persons.mergedIntoPersonId),
  ];
  if (query) {
    const term = likeTerm(query);
    conds.push(
      or(
        ilike(persons.firstName, term),
        ilike(persons.lastName, term),
        ilike(persons.email, term),
        sql`(${persons.firstName} || ' ' || ${persons.lastName}) ILIKE ${term}`,
      ) as SQL,
    );
  }
  const rows = await db
    .select({
      id: persons.id,
      firstName: persons.firstName,
      lastName: persons.lastName,
      email: persons.email,
    })
    .from(persons)
    .where(and(...conds))
    .orderBy(desc(persons.createdAt), asc(persons.id))
    .limit(pageSize + 1)
    .offset(page * pageSize);
  return { items: rows.slice(0, pageSize), hasMore: rows.length > pageSize, page };
}

export type EmployerPickerItem = { id: string; legalName: string; tradingName: string | null };

/** Non-archived employers by legal or trading name (same rows fetchEmployers returns). */
export async function searchEmployersForPicker(
  input: PickerQuery,
): Promise<PickerPage<EmployerPickerItem>> {
  await requireInternalStaff();
  const { query, page, pageSize } = parse(input);
  const conds: SQL[] = [isNull(employers.archivedAt)];
  if (query) {
    conds.push(
      or(
        ilike(employers.legalName, likeTerm(query)),
        ilike(employers.tradingName, likeTerm(query)),
      ) as SQL,
    );
  }
  const where = and(...conds);
  const rows = await db
    .select({
      id: employers.id,
      legalName: employers.legalName,
      tradingName: employers.tradingName,
    })
    .from(employers)
    .where(where)
    .orderBy(asc(employers.legalName), asc(employers.id))
    .limit(pageSize + 1)
    .offset(page * pageSize);
  return { items: rows.slice(0, pageSize), hasMore: rows.length > pageSize, page };
}

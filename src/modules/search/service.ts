import { and, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { requireInternalStaff } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { immigrationCases } from '@/lib/db/schema/immigration';
import { candidateProfiles, persons } from '@/lib/db/schema/persons';
import { employers, jobRequisitions } from '@/lib/db/schema/recruitment';

export type SearchResultKind = 'candidate' | 'person' | 'employer' | 'requisition' | 'immigration';

export type SearchResult = {
  kind: SearchResultKind;
  id: string;
  title: string;
  subtitle: string;
  href: string;
  /** Higher = shown first within its group. Cheap tie-breaker. */
  score: number;
};

const MIN_QUERY_LENGTH = 2;
const PER_GROUP_LIMIT = 5;

/**
 * Cross-entity search over persons, employers, requisitions, and immigration cases.
 * Uses simple ILIKE `%q%` — fine for small datasets. Add pg_trgm indexes if this
 * ever becomes a hot path.
 */
export async function globalSearch(rawQuery: string): Promise<SearchResult[]> {
  await requireInternalStaff();
  const q = rawQuery.trim();
  if (q.length < MIN_QUERY_LENGTH) return [];

  const like = `%${q}%`;
  const startsWith = `${q}%`;

  // Persons — surface those with an active candidate profile as "candidate",
  // otherwise "person" (leads, contacts, unactivated).
  const personRows = await db
    .select({
      id: persons.id,
      firstName: persons.firstName,
      lastName: persons.lastName,
      email: persons.email,
      phone: persons.phone,
      currentCity: persons.currentCity,
      isCandidate: sql<boolean>`${candidateProfiles.id} IS NOT NULL`,
      startsWith: sql<boolean>`(${persons.firstName} ILIKE ${startsWith} OR ${persons.lastName} ILIKE ${startsWith})`,
    })
    .from(persons)
    .leftJoin(candidateProfiles, eq(candidateProfiles.personId, persons.id))
    .where(
      and(
        eq(persons.isDraft, false),
        isNull(persons.mergedIntoPersonId),
        isNull(persons.archivedAt),
        or(
          ilike(persons.firstName, like),
          ilike(persons.lastName, like),
          ilike(persons.normalizedEmail, like),
          ilike(persons.phone, like),
        ),
      ),
    )
    .orderBy(desc(sql`(${persons.firstName} ILIKE ${startsWith})`), persons.lastName)
    .limit(PER_GROUP_LIMIT);

  const employerRows = await db
    .select({
      id: employers.id,
      legalName: employers.legalName,
      tradingName: employers.tradingName,
      city: employers.city,
      country: employers.country,
      startsWith: sql<boolean>`(${employers.legalName} ILIKE ${startsWith} OR ${employers.tradingName} ILIKE ${startsWith})`,
    })
    .from(employers)
    .where(or(ilike(employers.legalName, like), ilike(employers.tradingName, like)))
    .orderBy(desc(sql`(${employers.legalName} ILIKE ${startsWith})`), employers.legalName)
    .limit(PER_GROUP_LIMIT);

  const requisitionRows = await db
    .select({
      id: jobRequisitions.id,
      title: jobRequisitions.title,
      status: jobRequisitions.status,
      location: jobRequisitions.location,
      employerName: employers.legalName,
      startsWith: sql<boolean>`${jobRequisitions.title} ILIKE ${startsWith}`,
    })
    .from(jobRequisitions)
    .innerJoin(employers, eq(employers.id, jobRequisitions.employerId))
    .where(ilike(jobRequisitions.title, like))
    .orderBy(desc(sql`(${jobRequisitions.title} ILIKE ${startsWith})`))
    .limit(PER_GROUP_LIMIT);

  const caseRows = await db
    .select({
      id: immigrationCases.id,
      caseType: immigrationCases.caseType,
      status: immigrationCases.status,
      authorityReference: immigrationCases.authorityReference,
      firstName: persons.firstName,
      lastName: persons.lastName,
    })
    .from(immigrationCases)
    .innerJoin(persons, eq(persons.id, immigrationCases.beneficiaryPersonId))
    .where(
      or(
        ilike(immigrationCases.authorityReference, like),
        ilike(persons.firstName, like),
        ilike(persons.lastName, like),
      ),
    )
    .limit(PER_GROUP_LIMIT);

  const results: SearchResult[] = [];

  for (const p of personRows) {
    const subtitleParts = [
      p.email,
      p.phone,
      p.currentCity,
      p.isCandidate ? 'Candidate' : 'Person',
    ].filter(Boolean);
    results.push({
      kind: p.isCandidate ? 'candidate' : 'person',
      id: p.id,
      title: `${p.firstName} ${p.lastName}`,
      subtitle: subtitleParts.join(' · '),
      href: p.isCandidate ? `/candidates/${p.id}` : `/leads`,
      score: p.startsWith ? 20 : 10,
    });
  }

  for (const e of employerRows) {
    const subtitleParts = [
      e.tradingName && e.tradingName !== e.legalName ? e.tradingName : null,
      [e.city, e.country].filter(Boolean).join(', '),
    ].filter(Boolean);
    results.push({
      kind: 'employer',
      id: e.id,
      title: e.legalName,
      subtitle: subtitleParts.join(' · ') || 'Employer',
      href: `/employers/${e.id}`,
      score: e.startsWith ? 20 : 10,
    });
  }

  for (const r of requisitionRows) {
    const subtitleParts = [r.employerName, r.status.replace(/_/g, ' '), r.location].filter(Boolean);
    results.push({
      kind: 'requisition',
      id: r.id,
      title: r.title,
      subtitle: subtitleParts.join(' · '),
      href: `/requisitions/${r.id}`,
      score: r.startsWith ? 20 : 10,
    });
  }

  for (const c of caseRows) {
    const subtitleParts = [
      `${c.firstName} ${c.lastName}`,
      c.caseType.replace(/_/g, ' '),
      c.status.replace(/_/g, ' '),
      c.authorityReference,
    ].filter(Boolean);
    results.push({
      kind: 'immigration',
      id: c.id,
      title: c.authorityReference ?? `${c.caseType.replace(/_/g, ' ')} case`,
      subtitle: subtitleParts.join(' · '),
      href: `/immigration/${c.id}`,
      score: 10,
    });
  }

  return results;
}

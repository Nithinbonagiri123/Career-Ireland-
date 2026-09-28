import { and, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { requireInternalStaff } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { creditNotes, invoices, receipts } from '@/lib/db/schema/billing';
import { immigrationCases } from '@/lib/db/schema/immigration';
import { leads } from '@/lib/db/schema/leads';
import { candidateProfiles, persons } from '@/lib/db/schema/persons';
import { employers, jobRequisitions } from '@/lib/db/schema/recruitment';

export type SearchResultKind =
  | 'candidate'
  | 'person'
  | 'employer'
  | 'requisition'
  | 'immigration'
  | 'lead'
  | 'invoice'
  | 'receipt'
  | 'credit_note';

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

  // Financial documents: invoices, receipts, credit notes. Match on the
  // full formatted number ("INV-2026-000042") OR just the numeric suffix
  // ("42", "000042") so staff can type whatever they remember.
  const invoiceRows = await db
    .select({
      id: invoices.id,
      number: invoices.number,
      status: invoices.status,
      totalAmount: invoices.totalAmount,
      currencyCode: invoices.currencyCode,
      payerPersonId: invoices.payerPersonId,
      payerEmployerId: invoices.payerEmployerId,
      personName: sql<
        string | null
      >`CASE WHEN ${persons.id} IS NULL THEN NULL ELSE ${persons.firstName} || ' ' || ${persons.lastName} END`,
      employerName: employers.legalName,
    })
    .from(invoices)
    .leftJoin(persons, eq(persons.id, invoices.payerPersonId))
    .leftJoin(employers, eq(employers.id, invoices.payerEmployerId))
    .where(ilike(invoices.number, like))
    .orderBy(desc(invoices.issuedAt))
    .limit(PER_GROUP_LIMIT);

  const receiptRows = await db
    .select({
      id: receipts.id,
      number: receipts.number,
      amount: receipts.amount,
      currencyCode: receipts.currencyCode,
      payerPersonId: receipts.payerPersonId,
      payerEmployerId: receipts.payerEmployerId,
      personName: sql<
        string | null
      >`CASE WHEN ${persons.id} IS NULL THEN NULL ELSE ${persons.firstName} || ' ' || ${persons.lastName} END`,
      employerName: employers.legalName,
    })
    .from(receipts)
    .leftJoin(persons, eq(persons.id, receipts.payerPersonId))
    .leftJoin(employers, eq(employers.id, receipts.payerEmployerId))
    .where(ilike(receipts.number, like))
    .orderBy(desc(receipts.issuedAt))
    .limit(PER_GROUP_LIMIT);

  const creditNoteRows = await db
    .select({
      id: creditNotes.id,
      number: creditNotes.number,
      amount: creditNotes.amount,
      currencyCode: creditNotes.currencyCode,
      invoiceNumber: invoices.number,
      payerPersonId: invoices.payerPersonId,
      payerEmployerId: invoices.payerEmployerId,
    })
    .from(creditNotes)
    .innerJoin(invoices, eq(invoices.id, creditNotes.invoiceId))
    .where(ilike(creditNotes.number, like))
    .orderBy(desc(creditNotes.issuedAt))
    .limit(PER_GROUP_LIMIT);

  const leadRows = await db
    .select({
      id: leads.id,
      status: leads.status,
      firstName: persons.firstName,
      lastName: persons.lastName,
      email: persons.email,
      startsWith: sql<boolean>`(${persons.firstName} ILIKE ${startsWith} OR ${persons.lastName} ILIKE ${startsWith})`,
    })
    .from(leads)
    .innerJoin(persons, eq(persons.id, leads.personId))
    .where(
      and(
        isNull(leads.archivedAt),
        or(
          ilike(persons.firstName, like),
          ilike(persons.lastName, like),
          ilike(persons.email, like),
        ),
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

  for (const l of leadRows) {
    const subtitleParts = [l.email, l.status.replace(/_/g, ' ')].filter(Boolean);
    results.push({
      kind: 'lead',
      id: l.id,
      title: `${l.firstName} ${l.lastName}`,
      subtitle: subtitleParts.join(' · '),
      href: `/leads`,
      score: l.startsWith ? 20 : 10,
    });
  }

  for (const inv of invoiceRows) {
    // Route to whichever payer scope the invoice lives under, matching
    // the two invoice print routes. The DB CHECK guarantees exactly one
    // payer FK is populated, so `href` is always resolvable.
    const href = inv.payerPersonId
      ? `/candidates/${inv.payerPersonId}/invoices/${inv.number}`
      : inv.payerEmployerId
        ? `/employers/${inv.payerEmployerId}/invoices/${inv.number}`
        : '/payments';
    const subtitle = [
      `${inv.totalAmount} ${inv.currencyCode}`,
      inv.status.replace(/_/g, ' '),
      inv.personName ?? inv.employerName,
    ]
      .filter(Boolean)
      .join(' · ');
    results.push({
      kind: 'invoice',
      id: inv.id,
      title: inv.number,
      subtitle,
      href,
      // Exact number match ranks higher than partial. Case-insensitive.
      score: inv.number.toLowerCase() === q.toLowerCase() ? 30 : 15,
    });
  }

  for (const rec of receiptRows) {
    const href = rec.payerPersonId
      ? `/candidates/${rec.payerPersonId}/receipts/${rec.number}`
      : rec.payerEmployerId
        ? `/employers/${rec.payerEmployerId}/receipts/${rec.number}`
        : '/payments';
    const subtitle = [`${rec.amount} ${rec.currencyCode}`, rec.personName ?? rec.employerName]
      .filter(Boolean)
      .join(' · ');
    results.push({
      kind: 'receipt',
      id: rec.id,
      title: rec.number,
      subtitle,
      href,
      score: rec.number.toLowerCase() === q.toLowerCase() ? 30 : 15,
    });
  }

  for (const cn of creditNoteRows) {
    // Credit notes don't have their own print route — landing on the
    // parent invoice is the closest thing, and the invoice printable
    // renders every credit note against it in a dedicated section.
    const href = cn.payerPersonId
      ? `/candidates/${cn.payerPersonId}/invoices/${cn.invoiceNumber}`
      : cn.payerEmployerId
        ? `/employers/${cn.payerEmployerId}/invoices/${cn.invoiceNumber}`
        : '/payments';
    results.push({
      kind: 'credit_note',
      id: cn.id,
      title: cn.number,
      subtitle: `${cn.amount} ${cn.currencyCode} · credited against ${cn.invoiceNumber}`,
      href,
      score: cn.number.toLowerCase() === q.toLowerCase() ? 30 : 15,
    });
  }

  return results;
}

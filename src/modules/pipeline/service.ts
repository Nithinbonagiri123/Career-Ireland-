import { and, desc, eq, inArray, isNull } from 'drizzle-orm';

import { requireInternalStaff } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { candidateProfiles, persons } from '@/lib/db/schema/persons';
import {
  candidateMatches,
  jobApplications,
  placements,
  shortlistEntries,
} from '@/lib/db/schema/recruitment';

/**
 * Pipeline Wall query — for a given requisition, returns the
 * candidates at each stage of the recruitment funnel in one shape
 * the UI can iterate over.
 *
 * The recruitment pipeline is spread across four tables:
 *
 *   candidateMatches   status = SUGGESTED  → Matched band
 *                      status = REVIEWED   → Reviewed band
 *   shortlistEntries   any row             → Shortlisted band
 *   jobApplications    status = APPLIED    → Applied band
 *                      status = INTERVIEW  → Interview band
 *                      status = OFFER      → Offer band
 *   placements         status = CONFIRMED  → Placed band
 *
 * Each entry is a *distinct person* — we dedupe when the same person
 * appears in more than one table (e.g. shortlisted AND applied), the
 * later stage wins. The Pipeline Wall renders one card per person
 * per stage, so a duplicate would create a misleading duplicate on
 * screen.
 */

export type PipelineStageKey =
  | 'source'
  | 'review'
  | 'shortlist'
  | 'apply'
  | 'interview'
  | 'offer'
  | 'placed';

export type PipelineEntry = {
  personId: string;
  personName: string;
  personEmail: string | null;
  personPhone: string | null;
  personLocation: string | null;
  /** The DB row id that placed this entry into its band, e.g. the
   *  candidate_matches.id or job_applications.id. Used by advance/
   *  reject actions on the card. */
  entryId: string;
  /** Score from candidateMatches when available, so the card can
   *  render the same match ring the shortlist card uses. Null once
   *  the person has moved beyond the matches table. */
  matchScore: number | null;
};

export type PipelineData = Record<PipelineStageKey, PipelineEntry[]>;

export async function fetchRequisitionPipeline(requisitionId: string): Promise<PipelineData> {
  await requireInternalStaff();

  // ── 1. Placed ─────────────────────────────────────────────
  // A placement wins over every other status. Collect these first so
  // we can exclude their personIds from every earlier band.
  const placedRows = await db
    .select({
      personId: placements.personId,
      entryId: placements.id,
      firstName: persons.firstName,
      lastName: persons.lastName,
      email: persons.email,
      phone: persons.phone,
      currentCity: persons.currentCity,
      currentCountry: persons.currentCountry,
    })
    .from(placements)
    .innerJoin(persons, eq(persons.id, placements.personId))
    .where(
      and(
        eq(placements.jobRequisitionId, requisitionId),
        // "CONFIRMED" | "STARTED" | "COMPLETED" all count as placed
        // from the pipeline board's perspective; only "PROPOSED" and
        // "TERMINATED_EARLY" are excluded.
        inArray(placements.status, ['CONFIRMED', 'STARTED', 'COMPLETED']),
        isNull(persons.archivedAt),
      ),
    );
  const placedPersonIds = new Set(placedRows.map((r) => r.personId));

  // ── 2. Applications (Applied / Interview / Offer bands) ──
  const appRows = await db
    .select({
      personId: jobApplications.personId,
      entryId: jobApplications.id,
      status: jobApplications.status,
      firstName: persons.firstName,
      lastName: persons.lastName,
      email: persons.email,
      phone: persons.phone,
      currentCity: persons.currentCity,
      currentCountry: persons.currentCountry,
    })
    .from(jobApplications)
    .innerJoin(persons, eq(persons.id, jobApplications.personId))
    .where(
      and(
        eq(jobApplications.jobRequisitionId, requisitionId),
        isNull(persons.archivedAt),
      ),
    );

  // ── 3. Shortlist entries ─────────────────────────────────
  const shortlistRows = await db
    .select({
      personId: shortlistEntries.personId,
      entryId: shortlistEntries.id,
      firstName: persons.firstName,
      lastName: persons.lastName,
      email: persons.email,
      phone: persons.phone,
      currentCity: persons.currentCity,
      currentCountry: persons.currentCountry,
    })
    .from(shortlistEntries)
    .innerJoin(persons, eq(persons.id, shortlistEntries.personId))
    .where(
      and(
        eq(shortlistEntries.jobRequisitionId, requisitionId),
        isNull(persons.archivedAt),
      ),
    );

  // ── 4. Matches (source + review bands) ───────────────────
  const matchRows = await db
    .select({
      personId: candidateMatches.personId,
      entryId: candidateMatches.id,
      status: candidateMatches.status,
      score: candidateMatches.score,
      firstName: persons.firstName,
      lastName: persons.lastName,
      email: persons.email,
      phone: persons.phone,
      currentCity: persons.currentCity,
      currentCountry: persons.currentCountry,
    })
    .from(candidateMatches)
    .innerJoin(persons, eq(persons.id, candidateMatches.personId))
    .leftJoin(candidateProfiles, eq(candidateProfiles.personId, candidateMatches.personId))
    .where(
      and(
        eq(candidateMatches.jobRequisitionId, requisitionId),
        isNull(persons.archivedAt),
      ),
    )
    .orderBy(desc(candidateMatches.score));

  const scoreByPerson = new Map<string, number>();
  for (const r of matchRows) scoreByPerson.set(r.personId, r.score);

  // ── Assemble bands ────────────────────────────────────────
  const toEntry = <T extends { firstName: string; lastName: string; email: string | null; phone: string | null; currentCity: string | null; currentCountry: string | null; personId: string; entryId: string }>(
    r: T,
  ): PipelineEntry => ({
    personId: r.personId,
    entryId: r.entryId,
    personName: `${r.firstName} ${r.lastName}`,
    personEmail: r.email,
    personPhone: r.phone,
    personLocation: [r.currentCity, r.currentCountry].filter(Boolean).join(', ') || null,
    matchScore: scoreByPerson.get(r.personId) ?? null,
  });

  // Track which personIds have been placed into a later band. A
  // person shortlisted AND applied should show only in the
  // Applied/Interview/Offer band. This keeps a single card per person
  // on the wall.
  const claimed = new Set<string>(placedPersonIds);

  const placed = placedRows.map(toEntry);

  const offer: PipelineEntry[] = [];
  const interview: PipelineEntry[] = [];
  const apply: PipelineEntry[] = [];
  for (const r of appRows) {
    if (claimed.has(r.personId)) continue;
    const entry = toEntry(r);
    switch (r.status) {
      case 'OFFER':
      case 'ACCEPTED':
        offer.push(entry);
        claimed.add(r.personId);
        break;
      case 'INTERVIEW':
        interview.push(entry);
        claimed.add(r.personId);
        break;
      case 'APPLIED':
      case 'UNDER_REVIEW':
      case 'SHORTLISTED':
        // "SHORTLISTED" status on a job application is a distinct
        // state from the shortlistEntries row; it lands here
        // regardless because at that point the app has been created.
        apply.push(entry);
        claimed.add(r.personId);
        break;
      case 'REJECTED':
      case 'WITHDRAWN':
        // Not displayed on the pipeline wall.
        claimed.add(r.personId);
        break;
    }
  }

  const shortlist: PipelineEntry[] = [];
  for (const r of shortlistRows) {
    if (claimed.has(r.personId)) continue;
    shortlist.push(toEntry(r));
    claimed.add(r.personId);
  }

  const review: PipelineEntry[] = [];
  const source: PipelineEntry[] = [];
  for (const r of matchRows) {
    if (claimed.has(r.personId)) continue;
    const entry = toEntry(r);
    if (r.status === 'REVIEWED') {
      review.push(entry);
    } else if (r.status === 'SUGGESTED') {
      source.push(entry);
    }
    // DISMISSED / SHORTLISTED handled via shortlistRows above.
    claimed.add(r.personId);
  }

  return { source, review, shortlist, apply, interview, offer, placed };
}

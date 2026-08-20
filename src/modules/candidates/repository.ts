import { desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { candidateProfiles, persons } from '@/lib/db/schema/persons';

export type CandidateListRow = {
  candidateProfileId: string;
  personId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  currentCity: string | null;
  lifecycleStatus: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  availabilityStatus: 'AVAILABLE' | 'TEMPORARILY_UNAVAILABLE' | 'PLACED';
  activatedAt: Date;
};

export async function listCandidates(): Promise<CandidateListRow[]> {
  const rows = await db
    .select({
      candidateProfileId: candidateProfiles.id,
      personId: persons.id,
      firstName: persons.firstName,
      lastName: persons.lastName,
      email: persons.email,
      phone: persons.phone,
      currentCity: persons.currentCity,
      lifecycleStatus: candidateProfiles.lifecycleStatus,
      availabilityStatus: candidateProfiles.availabilityStatus,
      activatedAt: candidateProfiles.activatedAt,
    })
    .from(candidateProfiles)
    .innerJoin(persons, eq(persons.id, candidateProfiles.personId))
    .where(isNull(persons.mergedIntoPersonId))
    .orderBy(desc(candidateProfiles.activatedAt));

  return rows.map((r) => ({
    candidateProfileId: r.candidateProfileId,
    personId: r.personId,
    fullName: `${r.firstName} ${r.lastName}`.trim(),
    email: r.email,
    phone: r.phone,
    currentCity: r.currentCity,
    lifecycleStatus: r.lifecycleStatus,
    availabilityStatus: r.availabilityStatus,
    activatedAt: r.activatedAt,
  }));
}

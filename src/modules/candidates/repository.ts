import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { candidateProfiles, persons } from '@/lib/db/schema/persons';
import { users } from '@/lib/db/schema/users';
import { type AssignmentScope, assignmentCondition } from '@/lib/scope';

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
  assignedUserId: string | null;
  assignedUserName: string | null;
};

export async function listCandidates(opts?: {
  scope?: AssignmentScope;
  currentUserId?: string;
}): Promise<CandidateListRow[]> {
  const scopeCond =
    opts?.scope && opts.currentUserId
      ? assignmentCondition(opts.scope, candidateProfiles.assignedUserId, opts.currentUserId)
      : undefined;

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
      assignedUserId: candidateProfiles.assignedUserId,
      assignedUserName: users.fullName,
    })
    .from(candidateProfiles)
    .innerJoin(persons, eq(persons.id, candidateProfiles.personId))
    .leftJoin(users, eq(users.id, candidateProfiles.assignedUserId))
    // Filter draft, merged, and archived persons out of every active list —
    // CSV exports, dashboards, matching feeds, search: everything downstream
    // reads this and none of them should see half-filled onboarding drafts.
    .where(
      scopeCond
        ? and(
            eq(persons.isDraft, false),
            isNull(persons.mergedIntoPersonId),
            isNull(persons.archivedAt),
            scopeCond,
          )
        : and(
            eq(persons.isDraft, false),
            isNull(persons.mergedIntoPersonId),
            isNull(persons.archivedAt),
          ),
    )
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
    assignedUserId: r.assignedUserId,
    assignedUserName: r.assignedUserName,
  }));
}

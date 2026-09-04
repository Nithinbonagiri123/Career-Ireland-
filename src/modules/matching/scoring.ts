import type { MatchReasonSnapshot } from '@/lib/db/schema/recruitment';

/**
 * Pure deterministic scoring for a person against a requisition.
 *
 * Extracted into its own file (with no auth / DB imports) so it can be
 * unit-tested without pulling NextAuth into the vitest environment.
 *
 * Component weights (all totalled, capped at MAX_SCORE):
 *   - Occupation match (candidate.primary == requisition.occupation)   : +40
 *   - Availability = AVAILABLE                                          : +15
 *   - Lifecycle ACTIVE                                                  : +5
 *   - Preferred location includes requisition location                  : +5
 *   - Required-skills coverage (proportional to matched-required ratio) : up to +25
 *   - Preferred-skills coverage                                         : up to +12
 *   - Required-qualifications coverage                                  : up to +10
 *   - Preferred-qualifications coverage                                 : up to +5
 *
 * Bucketing:  >= 70 HIGH  |  40-69 MEDIUM  |  0-39 LOW
 */

export const WEIGHT_OCCUPATION = 40;
export const WEIGHT_AVAILABILITY = 15;
export const WEIGHT_LIFECYCLE = 5;
export const WEIGHT_LOCATION = 5;
export const WEIGHT_SKILLS_MAX = 25;
export const WEIGHT_QUALIFICATIONS_MAX = 10;
export const MAX_SCORE = 100;

export function bucketize(score: number): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (score >= 70) return 'HIGH';
  if (score >= 40) return 'MEDIUM';
  return 'LOW';
}

export type CandidateSnapshot = {
  personId: string;
  primaryOccupationId: string | null;
  availabilityStatus: 'AVAILABLE' | 'TEMPORARILY_UNAVAILABLE' | 'PLACED';
  lifecycleStatus: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  preferredLocation: string | null;
  skillIds: Set<string>;
  qualificationIds: Set<string>;
};

export type RequisitionSnapshot = {
  occupationId: string | null;
  location: string | null;
  requiredSkillIds: string[];
  preferredSkillIds: string[];
  skillNamesById: Map<string, string>;
  requiredQualificationIds: string[];
  preferredQualificationIds: string[];
  qualificationNamesById: Map<string, string>;
};

/** Compute score + per-component reason snapshots for a single candidate + requisition. */
export function scoreCandidate(
  candidate: CandidateSnapshot,
  requisition: RequisitionSnapshot,
): { score: number; reasons: MatchReasonSnapshot[] } {
  const reasons: MatchReasonSnapshot[] = [];

  // Occupation
  const occupationMatched =
    !!requisition.occupationId && candidate.primaryOccupationId === requisition.occupationId;
  reasons.push({
    label: 'Occupation match',
    points: occupationMatched ? WEIGHT_OCCUPATION : 0,
    matched: occupationMatched,
    detail: requisition.occupationId ? undefined : 'Requisition has no occupation set',
  });

  // Availability
  const isAvailable = candidate.availabilityStatus === 'AVAILABLE';
  reasons.push({
    label: 'Available',
    points: isAvailable ? WEIGHT_AVAILABILITY : 0,
    matched: isAvailable,
    detail: isAvailable ? undefined : `Currently ${candidate.availabilityStatus.toLowerCase()}`,
  });

  // Lifecycle
  const isActive = candidate.lifecycleStatus === 'ACTIVE';
  reasons.push({
    label: 'Active candidate',
    points: isActive ? WEIGHT_LIFECYCLE : 0,
    matched: isActive,
  });

  // Location
  const reqLocation = requisition.location?.toLowerCase() ?? '';
  const locationMatched =
    !!reqLocation &&
    !!candidate.preferredLocation &&
    candidate.preferredLocation.toLowerCase().includes(reqLocation);
  reasons.push({
    label: 'Location match',
    points: locationMatched ? WEIGHT_LOCATION : 0,
    matched: locationMatched,
    detail: !reqLocation ? 'Requisition has no location' : undefined,
  });

  // Required skills — proportional coverage
  if (requisition.requiredSkillIds.length > 0) {
    const matched = requisition.requiredSkillIds.filter((id) => candidate.skillIds.has(id));
    const points = Math.round(
      (matched.length / requisition.requiredSkillIds.length) * WEIGHT_SKILLS_MAX,
    );
    reasons.push({
      label: 'Required skills',
      points,
      matched: matched.length > 0,
      detail:
        matched.length === 0
          ? 'None of the required skills match'
          : `${matched.length}/${requisition.requiredSkillIds.length}: ${matched
              .map((id) => requisition.skillNamesById.get(id))
              .filter(Boolean)
              .join(', ')}`,
    });
  }

  // Preferred skills — bonus (half the required weight, only fires when at least one matches)
  if (requisition.preferredSkillIds.length > 0) {
    const matched = requisition.preferredSkillIds.filter((id) => candidate.skillIds.has(id));
    if (matched.length > 0) {
      const points = Math.round(
        (matched.length / requisition.preferredSkillIds.length) * (WEIGHT_SKILLS_MAX / 2),
      );
      reasons.push({
        label: 'Nice-to-have skills',
        points,
        matched: true,
        detail: `${matched.length}/${requisition.preferredSkillIds.length}: ${matched
          .map((id) => requisition.skillNamesById.get(id))
          .filter(Boolean)
          .join(', ')}`,
      });
    }
  }

  // Required qualifications
  if (requisition.requiredQualificationIds.length > 0) {
    const matched = requisition.requiredQualificationIds.filter((id) =>
      candidate.qualificationIds.has(id),
    );
    const points = Math.round(
      (matched.length / requisition.requiredQualificationIds.length) * WEIGHT_QUALIFICATIONS_MAX,
    );
    reasons.push({
      label: 'Required qualifications',
      points,
      matched: matched.length > 0,
      detail:
        matched.length === 0
          ? 'None of the required qualifications match'
          : `${matched.length}/${requisition.requiredQualificationIds.length}: ${matched
              .map((id) => requisition.qualificationNamesById.get(id))
              .filter(Boolean)
              .join(', ')}`,
    });
  }

  // Preferred qualifications
  if (requisition.preferredQualificationIds.length > 0) {
    const matched = requisition.preferredQualificationIds.filter((id) =>
      candidate.qualificationIds.has(id),
    );
    if (matched.length > 0) {
      const points = Math.round(
        (matched.length / requisition.preferredQualificationIds.length) *
          (WEIGHT_QUALIFICATIONS_MAX / 2),
      );
      reasons.push({
        label: 'Nice-to-have qualifications',
        points,
        matched: true,
        detail: `${matched.length}/${requisition.preferredQualificationIds.length}: ${matched
          .map((id) => requisition.qualificationNamesById.get(id))
          .filter(Boolean)
          .join(', ')}`,
      });
    }
  }

  const rawScore = reasons.reduce((sum, r) => sum + r.points, 0);
  const score = Math.min(MAX_SCORE, Math.max(0, rawScore));
  return { score, reasons };
}

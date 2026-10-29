import {
  MAX_SCORE,
  WEIGHT_AVAILABILITY,
  WEIGHT_LIFECYCLE,
  WEIGHT_LOCATION,
  WEIGHT_OCCUPATION,
  WEIGHT_QUALIFICATIONS_MAX,
  WEIGHT_SKILLS_MAX,
} from './scoring';

/**
 * R5 — what a job's criteria allow a candidate to score, using the
 * existing scoring weights (the formula itself is unchanged). Used to warn
 * when even a perfect candidate cannot reach the run's minimum score.
 */
export type JobCriteria = {
  hasOccupation: boolean;
  hasLocation: boolean;
  requiredSkills: number;
  preferredSkills: number;
  requiredQualifications: number;
  preferredQualifications: number;
};

export function maxAchievableScore(c: JobCriteria): number {
  const raw =
    WEIGHT_AVAILABILITY +
    WEIGHT_LIFECYCLE +
    (c.hasOccupation ? WEIGHT_OCCUPATION : 0) +
    (c.hasLocation ? WEIGHT_LOCATION : 0) +
    (c.requiredSkills > 0 ? WEIGHT_SKILLS_MAX : 0) +
    (c.preferredSkills > 0 ? Math.round(WEIGHT_SKILLS_MAX / 2) : 0) +
    (c.requiredQualifications > 0 ? WEIGHT_QUALIFICATIONS_MAX : 0) +
    (c.preferredQualifications > 0 ? Math.round(WEIGHT_QUALIFICATIONS_MAX / 2) : 0);
  return Math.min(MAX_SCORE, raw);
}

export type CriteriaWarning = { maxScore: number; suggestedMinScore: number; message: string };

/**
 * Warning for a job with neither an occupation nor a location set, when its
 * best possible score is below the chosen minimum. Suggests (never applies)
 * a lower minimum for this run.
 */
export function criteriaWarning(c: JobCriteria, minScore: number): CriteriaWarning | null {
  if (c.hasOccupation || c.hasLocation) return null;
  const maxScore = maxAchievableScore(c);
  if (maxScore >= minScore) return null;
  return {
    maxScore,
    suggestedMinScore: maxScore,
    message: `This job has no occupation or location set, so the best possible score is ${maxScore} of 100 — even a candidate who matches every required skill scores below ${minScore}. Consider lowering the minimum for this run to ${maxScore}, or add an occupation or location to the job.`,
  };
}

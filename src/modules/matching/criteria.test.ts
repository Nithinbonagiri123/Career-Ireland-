import { describe, expect, it } from 'vitest';
import { criteriaWarning, maxAchievableScore } from './criteria';

const none = {
  hasOccupation: false,
  hasLocation: false,
  requiredSkills: 0,
  preferredSkills: 0,
  requiredQualifications: 0,
  preferredQualifications: 0,
};

describe('maxAchievableScore (existing weights, formula unchanged)', () => {
  it('skills only → 45; nothing → 20; everything → capped at 100', () => {
    expect(maxAchievableScore({ ...none, requiredSkills: 2 })).toBe(45);
    expect(maxAchievableScore(none)).toBe(20);
    expect(
      maxAchievableScore({
        hasOccupation: true,
        hasLocation: true,
        requiredSkills: 1,
        preferredSkills: 1,
        requiredQualifications: 1,
        preferredQualifications: 1,
      }),
    ).toBe(100);
  });
});

describe('criteriaWarning', () => {
  it('warns when a job has neither occupation nor location and cannot reach the minimum', () => {
    const w = criteriaWarning({ ...none, requiredSkills: 1 }, 50);
    expect(w?.maxScore).toBe(45);
    expect(w?.suggestedMinScore).toBe(45);
    expect(w?.message).toMatch(/no occupation or location.*best possible score is 45.*below 50/);
  });
  it('no warning when occupation or location is set, or the minimum is reachable', () => {
    expect(criteriaWarning({ ...none, hasOccupation: true }, 50)).toBeNull();
    expect(criteriaWarning({ ...none, hasLocation: true, requiredSkills: 1 }, 50)).toBeNull();
    expect(criteriaWarning({ ...none, requiredSkills: 1 }, 40)).toBeNull();
  });
});

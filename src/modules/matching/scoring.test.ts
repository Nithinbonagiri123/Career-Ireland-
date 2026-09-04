import { describe, expect, it } from 'vitest';
import { scoreCandidate } from './scoring';

// Small helper — most tests only vary a couple of fields.
function candidate(
  overrides: Parameters<typeof scoreCandidate>[0] extends infer C ? Partial<C> : never = {},
) {
  return {
    personId: 'p1',
    primaryOccupationId: null,
    availabilityStatus: 'AVAILABLE' as const,
    lifecycleStatus: 'ACTIVE' as const,
    preferredLocation: null,
    skillIds: new Set<string>(),
    qualificationIds: new Set<string>(),
    ...overrides,
  };
}

function requisition(
  overrides: Parameters<typeof scoreCandidate>[1] extends infer R ? Partial<R> : never = {},
) {
  return {
    occupationId: null,
    location: null,
    requiredSkillIds: [] as string[],
    preferredSkillIds: [] as string[],
    skillNamesById: new Map<string, string>(),
    requiredQualificationIds: [] as string[],
    preferredQualificationIds: [] as string[],
    qualificationNamesById: new Map<string, string>(),
    ...overrides,
  };
}

describe('scoreCandidate', () => {
  it('bare-minimum candidate against bare-minimum requisition: only availability + lifecycle count', () => {
    const { score, reasons } = scoreCandidate(candidate(), requisition());
    // Available (+15) + Active (+5) = 20
    expect(score).toBe(20);
    expect(reasons.find((r) => r.label === 'Available')?.matched).toBe(true);
    expect(reasons.find((r) => r.label === 'Active candidate')?.matched).toBe(true);
  });

  it('unavailable candidate loses the +15 availability bonus', () => {
    const { score } = scoreCandidate(candidate({ availabilityStatus: 'PLACED' }), requisition());
    expect(score).toBe(5); // just Active
  });

  it('archived candidate loses the +5 lifecycle bonus', () => {
    const { score } = scoreCandidate(candidate({ lifecycleStatus: 'ARCHIVED' }), requisition());
    expect(score).toBe(15); // just Available
  });

  it('occupation match adds +40', () => {
    const occ = 'occ-123';
    const { score, reasons } = scoreCandidate(
      candidate({ primaryOccupationId: occ }),
      requisition({ occupationId: occ }),
    );
    expect(score).toBe(60); // 20 baseline + 40 occupation
    expect(reasons.find((r) => r.label === 'Occupation match')?.points).toBe(40);
  });

  it('mismatched occupation adds 0', () => {
    const { score } = scoreCandidate(
      candidate({ primaryOccupationId: 'a' }),
      requisition({ occupationId: 'b' }),
    );
    expect(score).toBe(20);
  });

  it('requisition without occupation set gives 0 for occupation regardless of candidate', () => {
    const { reasons } = scoreCandidate(
      candidate({ primaryOccupationId: 'anything' }),
      requisition({ occupationId: null }),
    );
    const occReason = reasons.find((r) => r.label === 'Occupation match');
    expect(occReason?.matched).toBe(false);
    expect(occReason?.points).toBe(0);
    expect(occReason?.detail).toMatch(/no occupation set/i);
  });

  it('location: case-insensitive substring match adds +5', () => {
    const { score, reasons } = scoreCandidate(
      candidate({ preferredLocation: 'Dublin & surrounds' }),
      requisition({ location: 'DUBLIN' }),
    );
    expect(reasons.find((r) => r.label === 'Location match')?.matched).toBe(true);
    expect(score).toBe(25); // 20 + 5
  });

  it('location: no match when candidate has no preferred location', () => {
    const { score } = scoreCandidate(candidate(), requisition({ location: 'Dublin' }));
    expect(score).toBe(20);
  });

  it('required skills: full coverage awards the full +25', () => {
    const { score, reasons } = scoreCandidate(
      candidate({ skillIds: new Set(['s1', 's2']) }),
      requisition({
        requiredSkillIds: ['s1', 's2'],
        skillNamesById: new Map([
          ['s1', 'TypeScript'],
          ['s2', 'React'],
        ]),
      }),
    );
    expect(score).toBe(45); // 20 + 25
    const skillReason = reasons.find((r) => r.label === 'Required skills');
    expect(skillReason?.points).toBe(25);
    expect(skillReason?.detail).toContain('TypeScript');
    expect(skillReason?.detail).toContain('React');
  });

  it('required skills: partial coverage is proportional and rounded', () => {
    const { reasons } = scoreCandidate(
      candidate({ skillIds: new Set(['s1']) }),
      requisition({
        requiredSkillIds: ['s1', 's2', 's3'],
        skillNamesById: new Map([['s1', 'TypeScript']]),
      }),
    );
    // 1/3 of 25 = 8.33 → rounded to 8
    expect(reasons.find((r) => r.label === 'Required skills')?.points).toBe(8);
  });

  it('required skills: zero coverage → 0 points but the reason is still recorded', () => {
    const { reasons } = scoreCandidate(
      candidate({ skillIds: new Set() }),
      requisition({ requiredSkillIds: ['s1'] }),
    );
    const r = reasons.find((r) => r.label === 'Required skills');
    expect(r?.points).toBe(0);
    expect(r?.matched).toBe(false);
    expect(r?.detail).toMatch(/none of the required skills match/i);
  });

  it('preferred skills only fire when at least one matches (no fake bonus for zero)', () => {
    const { reasons } = scoreCandidate(
      candidate({ skillIds: new Set() }),
      requisition({ preferredSkillIds: ['s1', 's2'] }),
    );
    expect(reasons.find((r) => r.label === 'Nice-to-have skills')).toBeUndefined();
  });

  it('preferred skills bonus: proportional to matched with half weight', () => {
    const { reasons } = scoreCandidate(
      candidate({ skillIds: new Set(['s1']) }),
      requisition({
        preferredSkillIds: ['s1', 's2'],
        skillNamesById: new Map([['s1', 'GraphQL']]),
      }),
    );
    // 1/2 of (25/2=12.5) = 6.25 → rounded to 6
    expect(reasons.find((r) => r.label === 'Nice-to-have skills')?.points).toBe(6);
  });

  it('required qualifications: full coverage awards +10', () => {
    const { reasons } = scoreCandidate(
      candidate({ qualificationIds: new Set(['q1']) }),
      requisition({
        requiredQualificationIds: ['q1'],
        qualificationNamesById: new Map([['q1', 'BSc CS']]),
      }),
    );
    expect(reasons.find((r) => r.label === 'Required qualifications')?.points).toBe(10);
  });

  it('score is clamped at MAX_SCORE=100', () => {
    // Stack every bonus: occupation + availability + lifecycle + location + skills + prefs + quals + qual-prefs
    const occ = 'occ';
    const { score } = scoreCandidate(
      candidate({
        primaryOccupationId: occ,
        preferredLocation: 'Cork',
        skillIds: new Set(['s1', 's2', 's3', 's4']),
        qualificationIds: new Set(['q1', 'q2']),
      }),
      requisition({
        occupationId: occ,
        location: 'Cork',
        requiredSkillIds: ['s1', 's2'],
        preferredSkillIds: ['s3', 's4'],
        requiredQualificationIds: ['q1'],
        preferredQualificationIds: ['q2'],
      }),
    );
    expect(score).toBeLessThanOrEqual(100);
    // Sum: 40+15+5+5+25+12+10+5 = 117 → clamped to 100
    expect(score).toBe(100);
  });

  it('score is never negative', () => {
    const { score } = scoreCandidate(
      candidate({ availabilityStatus: 'PLACED', lifecycleStatus: 'ARCHIVED' }),
      requisition(),
    );
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it('reason snapshots have the shape the DB column expects (label + points + matched)', () => {
    const { reasons } = scoreCandidate(candidate(), requisition());
    for (const r of reasons) {
      expect(typeof r.label).toBe('string');
      expect(typeof r.points).toBe('number');
      expect(typeof r.matched).toBe('boolean');
    }
  });
});

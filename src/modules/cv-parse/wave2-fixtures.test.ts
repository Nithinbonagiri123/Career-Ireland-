import { describe, expect, it } from 'vitest';
import { customCandidatesFrom, extractEmploymentCandidates, looksLikeQualification } from './text';

/**
 * Stage B Wave 2.1 — realistic-CV fixture coverage for the deterministic
 * extraction heuristics, per the client's acceptance requirements:
 * employer names, skills and certifications from CV-shaped text.
 * (File-level PDF/DOCX/scanned coverage lives in the Wave 2 e2e spec,
 * which uploads real fixture files through the UI.)
 */

const HEALTHCARE_CV = `
Lerato Mokoena
Healthcare Assistant — Cape Town, South Africa

PROFESSIONAL SUMMARY
Dedicated healthcare assistant with 8 years of experience in elder care.

SKILLS
Patient care, Wound dressing; Medication administration | Care planning
Communication, Teamwork

CERTIFICATIONS & TRAINING
Manual Handling Certificate — Safety First Training, 2024
Safe Pass
First Aid Response, Irish Red Cross
HACCP Level 2
Forklift Licence (counterbalance)
Care of the Older Person, QQI Level 5
National College of Ireland

EMPLOYMENT HISTORY
Healthcare Assistant at Mediclinic Cape Town
Jan 2019 - Present
Daily personal care for 12 residents; medication rounds.

Care Worker, Golden Years Nursing Home
Mar 2015 - Dec 2018
Night shift care and patient moving.
`;

describe('Wave 2.1 — certifications vocabulary (Irish trade/care credentials)', () => {
  it('recognises the credentials the client reported missing', () => {
    for (const line of [
      'Manual Handling Certificate — Safety First Training, 2024',
      'Safe Pass',
      'First Aid Response, Irish Red Cross',
      'HACCP Level 2',
      'Forklift Licence (counterbalance)',
      'Care of the Older Person, QQI Level 5',
      'Full clean Driving Licence',
      'Fire Safety Awareness',
      'Garda Vetting completed 2025',
    ]) {
      expect(looksLikeQualification(line), line).toBe(true);
    }
  });

  it('still rejects plain institution names and narrative lines', () => {
    expect(looksLikeQualification('National College of Ireland')).toBe(false);
    expect(looksLikeQualification('Responsible for a team of five')).toBe(false);
  });
});

describe('Wave 2.1 — skills + certification sections from a realistic CV', () => {
  it('splits the skills section into atomic items', () => {
    const skills = customCandidatesFrom(
      HEALTHCARE_CV,
      ['skills', 'competencies', 'technologies', 'tools', 'proficiencies'],
      new Set(),
    ).map((c) => c.phrase);
    expect(skills).toEqual(
      expect.arrayContaining(['Patient care', 'Wound dressing', 'Care planning', 'Teamwork']),
    );
  });

  it('collects certification lines under the certifications header', () => {
    const quals = customCandidatesFrom(
      HEALTHCARE_CV,
      ['qualifications', 'education', 'academic', 'certifications', 'training', 'courses'],
      new Set(),
    )
      .map((c) => c.phrase)
      .filter((p) => looksLikeQualification(p));
    expect(quals.join(' | ')).toContain('Manual Handling Certificate');
    expect(quals.join(' | ')).toContain('Safe Pass');
    expect(quals.join(' | ')).toContain('HACCP Level 2');
  });
});

describe('Wave 2.1 — employer names from employment history', () => {
  it('extracts employer, title and dates from "Title at Employer" and "Title, Employer" shapes', () => {
    const jobs = extractEmploymentCandidates(HEALTHCARE_CV, new Set());
    const employers = jobs.map((j) => j.employerName);
    expect(employers).toEqual(
      expect.arrayContaining(['Mediclinic Cape Town', 'Golden Years Nursing Home']),
    );
    const mediclinic = jobs.find((j) => j.employerName === 'Mediclinic Cape Town');
    expect(mediclinic?.jobTitle).toBe('Healthcare Assistant');
    expect(mediclinic?.isCurrent).toBe(true);
    expect(mediclinic?.startDate).toBe('2019-01-01');
  });
});

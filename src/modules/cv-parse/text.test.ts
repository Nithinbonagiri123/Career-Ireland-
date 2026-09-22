import { describe, expect, it } from 'vitest';
import { customCandidatesFrom, extractEmploymentCandidates, looksLikeHeader } from './text';

const SAMPLE_CV = `
NITHIN BONAGIRI
Software Engineer  ·  Dublin, Ireland
nithin@example.com  ·  +353 87 000 0000

PROFESSIONAL SUMMARY
Ten years of experience building web platforms.

EDUCATIONAL QUALIFICATIONS
BSc Computer Science, Trinity College Dublin (2014 - 2018)
Higher Diploma in Data Analytics, UCD (2019)
AWS Certified Solutions Architect (2022)

TECHNICAL SKILLS
TypeScript, React, Node.js, Postgres, Docker
AWS, Terraform, Kubernetes
Vitest, Playwright

EMPLOYMENT HISTORY

Senior Software Engineer — Stripe
Dublin, Ireland
Mar 2022 - Present
• Led migration of billing service to event-driven architecture
• Mentored four junior engineers
• Reduced P99 latency by 40%

Software Engineer — Intercom
Dublin
Jan 2019 - Feb 2022
• Built customer messaging pipeline
• Owned on-call rota for the platform team

Junior Developer — Web Agency Ltd
Cork
2016 - 2018
• Delivered client websites in React and Django

REFERENCES
Available on request.
`;

describe('looksLikeHeader', () => {
  it('accepts all-caps short lines', () => {
    expect(looksLikeHeader('EMPLOYMENT HISTORY')).toBe(true);
    expect(looksLikeHeader('EDUCATIONAL QUALIFICATIONS')).toBe(true);
  });
  it('accepts Title Case short lines', () => {
    expect(looksLikeHeader('Employment History')).toBe(true);
    expect(looksLikeHeader('Education & Qualifications')).toBe(true);
  });
  it('rejects sentence-like lines', () => {
    expect(looksLikeHeader('Led migration of billing service.')).toBe(false);
    expect(
      looksLikeHeader(
        'A long line of prose that goes well beyond sixty characters certainly should not.',
      ),
    ).toBe(false);
  });
});

describe('customCandidatesFrom — qualifications', () => {
  it('picks up quals under "EDUCATIONAL QUALIFICATIONS"', () => {
    const cands = customCandidatesFrom(
      SAMPLE_CV,
      [
        'qualifications',
        'qualification',
        'education',
        'educational',
        'academic',
        'certifications',
        'certification',
        'training',
        'courses',
        'diploma',
        'degree',
      ],
      new Set(),
    );
    const phrases = cands.map((c) => c.phrase);
    expect(phrases.some((p) => p.toLowerCase().includes('bsc computer science'))).toBe(true);
    expect(phrases.some((p) => p.toLowerCase().includes('higher diploma'))).toBe(true);
    expect(phrases.some((p) => p.toLowerCase().includes('aws certified'))).toBe(true);
  });
});

describe('customCandidatesFrom — skills', () => {
  it('picks up bulleted tokens under "TECHNICAL SKILLS"', () => {
    const cands = customCandidatesFrom(
      SAMPLE_CV,
      ['skills', 'competencies', 'technologies', 'tools', 'proficiencies'],
      new Set(),
    );
    const phrases = cands.map((c) => c.phrase.toLowerCase());
    expect(phrases).toContain('typescript');
    expect(phrases).toContain('react');
    expect(phrases).toContain('node.js');
    expect(phrases).toContain('aws');
    expect(phrases).toContain('kubernetes');
  });
});

describe('extractEmploymentCandidates', () => {
  it('finds three jobs with employer, title and dates', () => {
    const jobs = extractEmploymentCandidates(SAMPLE_CV, new Set());
    expect(jobs).toHaveLength(3);

    const stripe = jobs.find((j) => j.employerName.toLowerCase().includes('stripe'));
    expect(stripe).toBeDefined();
    expect(stripe?.jobTitle?.toLowerCase()).toContain('senior software engineer');
    expect(stripe?.startDate).toBe('2022-03-01');
    expect(stripe?.isCurrent).toBe(true);
    expect(stripe?.endDate).toBeNull();
    expect(stripe?.description ?? '').toContain('billing service');

    const intercom = jobs.find((j) => j.employerName.toLowerCase().includes('intercom'));
    expect(intercom).toBeDefined();
    expect(intercom?.startDate).toBe('2019-01-01');
    expect(intercom?.endDate).toBe('2022-02-01');
    expect(intercom?.isCurrent).toBe(false);

    const agency = jobs.find((j) => j.employerName.toLowerCase().includes('web agency'));
    expect(agency).toBeDefined();
    expect(agency?.startDate).toBe('2016-01-01');
    expect(agency?.endDate).toBe('2018-01-01');
  });

  it('deduplicates against already-recorded jobs', () => {
    const taken = new Set(['stripe|senior software engineer']);
    const jobs = extractEmploymentCandidates(SAMPLE_CV, taken);
    expect(jobs.map((j) => j.employerName.toLowerCase())).not.toContain('stripe');
  });

  it('returns empty when there is no employment section', () => {
    expect(extractEmploymentCandidates('Just some text with no headers.', new Set())).toEqual([]);
  });

  it('handles "Work Experience" header variant with 03/2020 date format', () => {
    const cv = `
WORK EXPERIENCE

Product Designer at Acme Corp
Berlin
03/2020 - 08/2023
Designed the mobile onboarding flow.

QUALIFICATIONS
BSc Design
`;
    const jobs = extractEmploymentCandidates(cv, new Set());
    expect(jobs).toHaveLength(1);
    expect(jobs[0].employerName.toLowerCase()).toContain('acme');
    expect(jobs[0].jobTitle?.toLowerCase()).toContain('product designer');
    expect(jobs[0].startDate).toBe('2020-03-01');
    expect(jobs[0].endDate).toBe('2023-08-01');
  });

  it('handles "Professional Experience" with year-only dates', () => {
    const cv = `
PROFESSIONAL EXPERIENCE

Data Analyst — Bank of Ireland
Dublin
2018 - 2022
Owned the customer segmentation pipeline.
`;
    const jobs = extractEmploymentCandidates(cv, new Set());
    expect(jobs).toHaveLength(1);
    expect(jobs[0].startDate).toBe('2018-01-01');
    expect(jobs[0].endDate).toBe('2022-01-01');
  });
});

describe('customCandidatesFrom — mixed header spellings', () => {
  it('finds quals under an "ACADEMIC BACKGROUND" header', () => {
    const cv = `
ACADEMIC BACKGROUND
MSc Data Science, DCU (2019 - 2020)
BSc Mathematics, TCD (2015 - 2019)

REFERENCES
Available on request.
`;
    const cands = customCandidatesFrom(
      cv,
      ['qualifications', 'education', 'academic', 'certifications'],
      new Set(),
    );
    const phrases = cands.map((c) => c.phrase.toLowerCase());
    expect(phrases.some((p) => p.includes('msc data science'))).toBe(true);
    expect(phrases.some((p) => p.includes('bsc mathematics'))).toBe(true);
  });
});

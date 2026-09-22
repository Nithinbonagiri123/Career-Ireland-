import { and, desc, eq } from 'drizzle-orm';
import { requireInternalStaff } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import {
  candidateQualifications,
  candidateSkills,
  employmentHistory,
} from '@/lib/db/schema/candidate_details';
import { documentInstances } from '@/lib/db/schema/documents';
import { documentTypes } from '@/lib/db/schema/reference';
import { fetchQualifications } from '@/modules/qualifications/service';
import { fetchSkills } from '@/modules/skills/service';
import { extractCvText } from './service';
import { catalogHitsFor, customCandidatesFrom, extractEmploymentCandidates } from './text';

/**
 * CV-derived suggestions for a candidate.
 *
 * Three axes: skills, qualifications, employment history.
 *
 * Skills / quals output two buckets:
 *   1. `catalogHits` — canonical catalog rows whose name appears verbatim
 *      (case-insensitive, whole word) in the CV text.
 *   2. `customCandidates` — likely-multi-word phrases from Skills /
 *      Education sections that don't map to any catalog row. Added as
 *      `custom_name` — same free-text path we already built.
 *
 * Employment history returns parsed `EmploymentCandidate` blocks from
 * the CV's Employment History / Work Experience section: employer, job
 * title, best-effort start/end dates, and the raw block as context.
 *
 * Already-added items are filtered out server-side.
 *
 * Deterministic; no LLM. Text-processing logic lives in `./text` so it
 * can be unit-tested without DB / env dependencies.
 */

export type { CatalogHit, CustomCandidate, EmploymentCandidate } from './text';

export type CvSuggestions = {
  documentInstanceId: string | null;
  filename: string | null;
  parsedAt: Date | null;
  /** Human-readable reason when parsing failed. `null` means it parsed OK. */
  parseError: string | null;
  skills: {
    catalogHits: import('./text').CatalogHit[];
    customCandidates: import('./text').CustomCandidate[];
  };
  qualifications: {
    catalogHits: import('./text').CatalogHit[];
    customCandidates: import('./text').CustomCandidate[];
  };
  employment: {
    candidates: import('./text').EmploymentCandidate[];
  };
};

/**
 * Pick the most recent non-voided CV for a person. Returns null if none.
 */
async function findLatestCvForPerson(
  personId: string,
): Promise<{ id: string; filename: string; mimeType: string } | null> {
  const [row] = await db
    .select({
      id: documentInstances.id,
      filename: documentInstances.originalFilename,
      displayName: documentInstances.displayName,
      mimeType: documentInstances.mimeType,
    })
    .from(documentInstances)
    .innerJoin(documentTypes, eq(documentTypes.id, documentInstances.documentTypeId))
    .where(and(eq(documentInstances.ownerPersonId, personId), eq(documentTypes.code, 'CV')))
    .orderBy(desc(documentInstances.createdAt))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    filename: row.displayName ?? row.filename,
    mimeType: row.mimeType,
  };
}

export async function buildCvSuggestions(personId: string): Promise<CvSuggestions> {
  await requireInternalStaff();

  const cv = await findLatestCvForPerson(personId);
  if (!cv) {
    return {
      documentInstanceId: null,
      filename: null,
      parsedAt: null,
      parseError: null,
      skills: { catalogHits: [], customCandidates: [] },
      qualifications: { catalogHits: [], customCandidates: [] },
      employment: { candidates: [] },
    };
  }

  let text = '';
  let parsedAt: Date | null = null;
  try {
    const r = await extractCvText(cv.id);
    text = r.textContent;
    parsedAt = r.parsedAt;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Extraction failed';
    return {
      documentInstanceId: cv.id,
      filename: cv.filename,
      parsedAt: null,
      parseError: message,
      skills: { catalogHits: [], customCandidates: [] },
      qualifications: { catalogHits: [], customCandidates: [] },
      employment: { candidates: [] },
    };
  }

  const [catalogSkills, catalogQuals, existingSkills, existingQuals, existingEmp] =
    await Promise.all([
      fetchSkills(),
      fetchQualifications(),
      db
        .select({
          skillId: candidateSkills.skillId,
          customName: candidateSkills.customName,
        })
        .from(candidateSkills)
        .where(eq(candidateSkills.personId, personId)),
      db
        .select({
          qualificationId: candidateQualifications.qualificationId,
          customName: candidateQualifications.customName,
        })
        .from(candidateQualifications)
        .where(eq(candidateQualifications.personId, personId)),
      db
        .select({
          employerName: employmentHistory.employerName,
          jobTitle: employmentHistory.jobTitle,
        })
        .from(employmentHistory)
        .where(eq(employmentHistory.personId, personId)),
    ]);

  const excludeSkillIds = new Set<string>();
  const excludeSkillNames = new Set<string>();
  for (const r of existingSkills) {
    if (r.skillId) excludeSkillIds.add(r.skillId);
    if (r.customName) excludeSkillNames.add(r.customName.toLowerCase());
  }
  const excludeQualIds = new Set<string>();
  const excludeQualNames = new Set<string>();
  for (const r of existingQuals) {
    if (r.qualificationId) excludeQualIds.add(r.qualificationId);
    if (r.customName) excludeQualNames.add(r.customName.toLowerCase());
  }
  const excludeEmp = new Set<string>();
  for (const r of existingEmp) {
    excludeEmp.add(`${r.employerName.toLowerCase()}|${(r.jobTitle ?? '').toLowerCase()}`);
  }

  const skillHits = catalogHitsFor(text, catalogSkills, excludeSkillIds);
  const qualHits = catalogHitsFor(text, catalogQuals, excludeQualIds);

  const takenForSkills = new Set([
    ...skillHits.map((h) => h.name.toLowerCase()),
    ...excludeSkillNames,
  ]);
  const takenForQuals = new Set([
    ...qualHits.map((h) => h.name.toLowerCase()),
    ...excludeQualNames,
  ]);

  const customSkills = customCandidatesFrom(
    text,
    ['skills', 'competencies', 'technologies', 'tools', 'proficiencies'],
    takenForSkills,
  );
  const customQuals = customCandidatesFrom(
    text,
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
    takenForQuals,
  );

  const employmentCandidates = extractEmploymentCandidates(text, excludeEmp);

  return {
    documentInstanceId: cv.id,
    filename: cv.filename,
    parsedAt,
    parseError: null,
    skills: { catalogHits: skillHits, customCandidates: customSkills },
    qualifications: { catalogHits: qualHits, customCandidates: customQuals },
    employment: { candidates: employmentCandidates },
  };
}

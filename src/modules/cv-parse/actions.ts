'use server';

import { revalidatePath } from 'next/cache';
import { toActionResult } from '@/lib/result';
import {
  addCandidateQualification,
  addCandidateSkill,
  upsertEmploymentHistory,
} from '@/modules/candidate-details/service';
import { buildCvSuggestions } from './suggest';

export async function buildCvSuggestionsAction(input: { personId: string }) {
  return toActionResult(() => buildCvSuggestions(input.personId));
}

export type EmploymentPick = {
  employerName: string;
  jobTitle: string | null;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  description: string | null;
};

/**
 * Bulk-accept picks from the CV suggestions panel. Splits into three
 * axes (skills / quals / employment), each with catalog IDs, free-text
 * names, or fully-formed employment rows. One transaction-per-add so a
 * single failure doesn't roll back the batch — staff sees a per-item
 * toast instead.
 */
export async function acceptCvSuggestionsAction(input: {
  personId: string;
  skillIds: string[];
  customSkills: string[];
  qualificationIds: string[];
  customQualifications: string[];
  employment: EmploymentPick[];
}) {
  return toActionResult(async () => {
    let added = 0;
    const errors: string[] = [];
    for (const id of input.skillIds) {
      try {
        await addCandidateSkill({
          personId: input.personId,
          skillId: id,
          proficiency: 'INTERMEDIATE',
        });
        added++;
      } catch (e) {
        errors.push(`skill ${id.slice(0, 6)}: ${(e as Error).message}`);
      }
    }
    for (const name of input.customSkills) {
      try {
        await addCandidateSkill({
          personId: input.personId,
          customName: name,
          proficiency: 'INTERMEDIATE',
        });
        added++;
      } catch (e) {
        errors.push(`skill "${name}": ${(e as Error).message}`);
      }
    }
    for (const id of input.qualificationIds) {
      try {
        await addCandidateQualification({
          personId: input.personId,
          qualificationId: id,
        });
        added++;
      } catch (e) {
        errors.push(`qual ${id.slice(0, 6)}: ${(e as Error).message}`);
      }
    }
    for (const name of input.customQualifications) {
      try {
        await addCandidateQualification({
          personId: input.personId,
          customName: name,
        });
        added++;
      } catch (e) {
        errors.push(`qual "${name}": ${(e as Error).message}`);
      }
    }
    for (const emp of input.employment) {
      try {
        await upsertEmploymentHistory({
          personId: input.personId,
          employerName: emp.employerName,
          jobTitle: emp.jobTitle ?? '',
          location: emp.location ?? '',
          startDate: emp.startDate ?? '',
          endDate: emp.isCurrent ? '' : (emp.endDate ?? ''),
          isCurrent: emp.isCurrent,
          description: emp.description ?? '',
        });
        added++;
      } catch (e) {
        errors.push(`job "${emp.employerName}": ${(e as Error).message}`);
      }
    }
    revalidatePath(`/candidates/${input.personId}`);
    return { added, errors };
  });
}

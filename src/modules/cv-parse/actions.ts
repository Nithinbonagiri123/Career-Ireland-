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
    // Fan out every pick in parallel. Each add is its own transaction
    // (addCandidateSkill / addCandidateQualification / upsertEmploymentHistory
    // open their own tx internally), so Promise.allSettled preserves the
    // per-item failure isolation the comment above describes while
    // collapsing N serial round-trips into one. A 20-pick batch goes
    // from ~20× single-insert latency to roughly 1×.
    const tasks: { label: string; run: () => Promise<unknown> }[] = [];
    for (const id of input.skillIds) {
      tasks.push({
        label: `skill ${id.slice(0, 6)}`,
        run: () =>
          addCandidateSkill({
            personId: input.personId,
            skillId: id,
            proficiency: 'INTERMEDIATE',
          }),
      });
    }
    for (const name of input.customSkills) {
      tasks.push({
        label: `skill "${name}"`,
        run: () =>
          addCandidateSkill({
            personId: input.personId,
            customName: name,
            proficiency: 'INTERMEDIATE',
          }),
      });
    }
    for (const id of input.qualificationIds) {
      tasks.push({
        label: `qual ${id.slice(0, 6)}`,
        run: () =>
          addCandidateQualification({
            personId: input.personId,
            qualificationId: id,
          }),
      });
    }
    for (const name of input.customQualifications) {
      tasks.push({
        label: `qual "${name}"`,
        run: () =>
          addCandidateQualification({
            personId: input.personId,
            customName: name,
          }),
      });
    }
    for (const emp of input.employment) {
      tasks.push({
        label: `job "${emp.employerName}"`,
        run: () =>
          upsertEmploymentHistory({
            personId: input.personId,
            employerName: emp.employerName,
            jobTitle: emp.jobTitle ?? '',
            location: emp.location ?? '',
            startDate: emp.startDate ?? '',
            endDate: emp.isCurrent ? '' : (emp.endDate ?? ''),
            isCurrent: emp.isCurrent,
            description: emp.description ?? '',
          }),
      });
    }

    const results = await Promise.allSettled(tasks.map((t) => t.run()));
    let added = 0;
    const errors: string[] = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        added++;
      } else {
        errors.push(`${tasks[i].label}: ${(r.reason as Error).message}`);
      }
    });

    revalidatePath(`/candidates/${input.personId}`);
    return { added, errors };
  });
}

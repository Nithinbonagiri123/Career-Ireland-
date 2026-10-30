'use client';

import { FilterToolbar } from '@/components/ds/list-controls';
import { CANDIDATE_STATUSES, IMMIGRATION_OPTIONS } from './candidate-filters';

/**
 * Stage 6G — Candidates filter bar on the shared FilterToolbar. Same URL
 * params as before (`q`, `status`, `profession`, `country`, `assignee`),
 * still multi-select and comma-separated, plus an Irish immigration status
 * filter. On phones the secondary filters sit behind "More filters", whose
 * badge counts the ones that are set so nothing is hidden silently.
 */
export function CandidatesInlineFilterBar({
  countries,
  occupations,
  assignees,
}: {
  countries: string[];
  occupations: Array<{ id: string; name: string }>;
  assignees: Array<{ id: string; fullName: string }>;
}) {
  return (
    <FilterToolbar
      searchPlaceholder="Search candidates by name, email, profession…"
      selects={[
        {
          param: 'status',
          label: 'Status',
          multiple: true,
          options: [
            { value: '', label: 'All statuses' },
            ...CANDIDATE_STATUSES.map((s) => ({ value: s.value, label: s.label })),
          ],
        },
        {
          param: 'profession',
          label: 'Profession',
          multiple: true,
          options: [
            { value: '', label: 'Any profession' },
            ...occupations.map((o) => ({ value: o.id, label: o.name })),
          ],
        },
        {
          param: 'country',
          label: 'Nationality',
          multiple: true,
          secondary: true,
          options: [
            { value: '', label: 'All nationalities' },
            ...countries.map((c) => ({ value: c, label: c })),
          ],
        },
        {
          param: 'assignee',
          label: 'Assigned to',
          multiple: true,
          secondary: true,
          options: [
            { value: '', label: 'All staff' },
            ...assignees.map((a) => ({ value: a.id, label: a.fullName })),
          ],
        },
        {
          param: 'immigration',
          label: 'Irish status',
          multiple: true,
          secondary: true,
          options: [{ value: '', label: 'Any status' }, ...IMMIGRATION_OPTIONS],
        },
      ]}
    />
  );
}

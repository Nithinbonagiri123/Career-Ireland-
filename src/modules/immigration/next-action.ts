/**
 * Next-step state machine for an Immigration case. Pure function; see
 * src/modules/candidates/next-action.ts for the shared contract.
 */

export type ImmigrationNextAction = {
  label: 'NEXT STEP';
  dueHint: string | null;
  sentence: string;
  tone: 'default' | 'urgent';
  primary: { label: string; href: string };
};

export type ImmigrationNextActionInput = {
  caseId: string;
  status: string;
  /** YYYY-MM-DD date strings as returned by Drizzle's `date` columns. */
  reminderOn: string | null;
  expiresOn: string | null;
  decisionAt: string | null;
  submittedAt: string | null;
  /** Document requirement counts; drives whether to chase or submit. */
  requirements: { total: number; missing: number };
  now?: Date;
};

function parseDateOnly(ymd: string | null): Date | null {
  if (!ymd) return null;
  const d = new Date(`${ymd}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function computeImmigrationNextAction(
  input: ImmigrationNextActionInput,
): ImmigrationNextAction | null {
  const now = input.now ?? new Date();
  const today = startOfUtcDay(now);
  const { caseId, status, reminderOn, expiresOn, requirements } = input;

  if (status === 'CLOSED') return null;

  const expires = parseDateOnly(expiresOn);
  if (expires && expires.getTime() < today.getTime() && status !== 'CLOSED') {
    return {
      label: 'NEXT STEP',
      dueHint: 'expired',
      sentence: 'The permit has expired — raise a renewal case or archive this one.',
      tone: 'urgent',
      primary: { label: 'Open case', href: `/immigration/${caseId}` },
    };
  }

  const reminder = parseDateOnly(reminderOn);
  if (reminder && reminder.getTime() <= today.getTime()) {
    return {
      label: 'NEXT STEP',
      dueHint: 'reminder today',
      sentence: 'Reminder has fired — chase the authority or the beneficiary.',
      tone: 'urgent',
      primary: { label: 'Open case', href: `/immigration/${caseId}` },
    };
  }

  if (status === 'OPEN') {
    return {
      label: 'NEXT STEP',
      dueHint: null,
      sentence: 'Request the required documents from the beneficiary.',
      tone: 'default',
      primary: { label: 'Open documents', href: `/immigration/${caseId}?tab=documents` },
    };
  }

  if (status === 'DOCUMENTS_PENDING') {
    if (requirements.missing > 0) {
      return {
        label: 'NEXT STEP',
        dueHint: null,
        sentence: `Chase the ${requirements.missing} missing document${requirements.missing === 1 ? '' : 's'}.`,
        tone: 'default',
        primary: { label: 'Open documents', href: `/immigration/${caseId}?tab=documents` },
      };
    }
    return {
      label: 'NEXT STEP',
      dueHint: null,
      sentence: 'All documents in — submit the case to the authority.',
      tone: 'default',
      primary: { label: 'Open case', href: `/immigration/${caseId}` },
    };
  }

  if (status === 'SUBMITTED' || status === 'UNDER_AUTHORITY_REVIEW') {
    return {
      label: 'NEXT STEP',
      dueHint: null,
      sentence: 'Awaiting authority decision — set a reminder so this never goes quiet.',
      tone: 'default',
      primary: { label: 'Open case', href: `/immigration/${caseId}` },
    };
  }

  if (status === 'APPROVED' || status === 'REJECTED') {
    return {
      label: 'NEXT STEP',
      dueHint: null,
      sentence: 'Decision recorded — archive the case to clear it from the active list.',
      tone: 'default',
      primary: { label: 'Open case', href: `/immigration/${caseId}` },
    };
  }

  return null;
}

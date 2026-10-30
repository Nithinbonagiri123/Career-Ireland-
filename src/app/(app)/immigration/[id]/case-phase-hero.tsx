import { format } from 'date-fns';
import { Check, Route } from 'lucide-react';
import type { ReactNode } from 'react';
import { SectionCard } from '@/components/ds/workspace';
import { cn } from '@/lib/utils';

/**
 * Case progress (Stage 6G): a neutral section card showing which of the
 * four phases the case is in, a short explanation and — while documents
 * are being collected — the mandatory-document progress bar.
 *
 *   OPEN / DOCUMENTS_PENDING           → 1 Intake
 *   SUBMITTED / UNDER_AUTHORITY_REVIEW → 2 With the authority
 *   APPROVED / REJECTED                → 3 Decision
 *   CLOSED                             → 4 Closed
 *
 * The status itself is shown once, in the page header.
 */

export type ImmigrationPhase = 'INTAKE' | 'SUBMISSION' | 'DECISION' | 'TERMINAL';

export type CaseHeroInput = {
  status: string;
  submittedAt: string | null;
  decisionAt: string | null;
  expiresOn: string | null;
  reminderOn: string | null;
  openedAt: Date;
  requirements: { total: number; missingMandatory: number; totalMandatory: number };
};

const PHASES: Array<{ key: ImmigrationPhase; label: string }> = [
  { key: 'INTAKE', label: 'Intake' },
  { key: 'SUBMISSION', label: 'With the authority' },
  { key: 'DECISION', label: 'Decision' },
  { key: 'TERMINAL', label: 'Closed' },
];

export function phaseFromStatus(status: string): ImmigrationPhase {
  if (status === 'OPEN' || status === 'DOCUMENTS_PENDING') return 'INTAKE';
  if (status === 'SUBMITTED' || status === 'UNDER_AUTHORITY_REVIEW') return 'SUBMISSION';
  if (status === 'APPROVED' || status === 'REJECTED') return 'DECISION';
  return 'TERMINAL';
}

/** Date-only columns (YYYY-MM-DD) → "4 Nov 2026". */
function day(value: string | null) {
  return value ? format(new Date(`${value}T00:00:00Z`), 'd MMM yyyy') : null;
}

export function CasePhaseHero({
  input,
  beneficiaryName,
}: {
  input: CaseHeroInput;
  beneficiaryName: string;
}) {
  const phase = phaseFromStatus(input.status);
  const index = PHASES.findIndex((p) => p.key === phase);
  const { heading, body, extra } = describe(phase, input, beneficiaryName);

  return (
    <SectionCard
      icon={Route}
      title="Case progress"
      testId="case-progress"
      action={
        <span className="text-xs font-medium tabular-nums text-muted-foreground">
          Phase {index + 1} of {PHASES.length}
        </span>
      }
    >
      <ol className="grid grid-cols-4 gap-1.5" aria-label="Case phases">
        {PHASES.map((p, i) => {
          const done = i < index;
          const active = i === index;
          return (
            <li key={p.key} className="min-w-0" aria-current={active ? 'step' : undefined}>
              <span
                aria-hidden
                className={cn(
                  'block h-1.5 rounded-full',
                  done || active ? 'bg-primary' : 'bg-muted',
                )}
              />
              <span
                className={cn(
                  'mt-1.5 flex items-center gap-1 text-[11px] leading-tight sm:text-xs',
                  active ? 'font-semibold text-foreground' : 'text-muted-foreground',
                )}
              >
                {done && <Check className="size-3 shrink-0 text-primary" aria-hidden />}
                <span className="[overflow-wrap:anywhere]">{p.label}</span>
                {done && <span className="sr-only">(done)</span>}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="mt-4">
        <p className="text-sm font-semibold text-foreground">{heading}</p>
        <div className="mt-1 space-y-1 text-sm text-muted-foreground">{body}</div>
        {extra}
      </div>
    </SectionCard>
  );
}

function describe(
  phase: ImmigrationPhase,
  input: CaseHeroInput,
  beneficiaryName: string,
): { heading: string; body: ReactNode; extra?: ReactNode } {
  if (phase === 'INTAKE') {
    const { total, missingMandatory, totalMandatory } = input.requirements;
    const provided = totalMandatory - missingMandatory;
    const pct = totalMandatory === 0 ? 0 : Math.round((provided / totalMandatory) * 100);
    const allIn = missingMandatory === 0 && totalMandatory > 0;
    return {
      heading: allIn
        ? 'All documents received — ready to submit to the authority.'
        : `Collecting documents from ${beneficiaryName}.`,
      body:
        totalMandatory === 0 ? (
          <p>Define the required documents for this case type to start the intake checklist.</p>
        ) : allIn ? (
          <p>Review the attached documents, then move the case to Submitted when you lodge it.</p>
        ) : (
          <p>
            {missingMandatory} of {totalMandatory} required document
            {totalMandatory === 1 ? '' : 's'} still outstanding. Chase the beneficiary or send a
            document request from the Documents tab.
          </p>
        ),
      extra:
        totalMandatory > 0 ? (
          <div className="mt-3 space-y-1.5">
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${pct}% of mandatory documents received`}
            >
              <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-xs tabular-nums text-muted-foreground">
              {provided} of {totalMandatory} mandatory documents received
              {total > totalMandatory ? ` · ${total - totalMandatory} optional` : ''}
            </p>
          </div>
        ) : undefined,
    };
  }

  if (phase === 'SUBMISSION') {
    const submitted = day(input.submittedAt);
    const reminder = day(input.reminderOn);
    return {
      heading:
        input.status === 'SUBMITTED'
          ? 'Case submitted — awaiting a decision.'
          : 'Under authority review.',
      body: (
        <>
          {submitted && (
            <p>
              Submitted on <span className="font-medium text-foreground">{submitted}</span>.
            </p>
          )}
          <p>
            {reminder ? (
              <>
                Reminder set for <span className="font-medium text-foreground">{reminder}</span> — a
                task is created that day so the case can't go quiet.
              </>
            ) : (
              'No reminder set. Add one from the case header so this case doesn’t drift.'
            )}
          </p>
        </>
      ),
    };
  }

  if (phase === 'DECISION') {
    const approved = input.status === 'APPROVED';
    const decided = day(input.decisionAt);
    const expires = day(input.expiresOn);
    return {
      heading: approved ? 'Permit approved.' : 'Case rejected.',
      body: (
        <>
          {decided && (
            <p>
              Decided on <span className="font-medium text-foreground">{decided}</span>.
            </p>
          )}
          {approved && expires && (
            <p>
              Permit expires on <span className="font-medium text-foreground">{expires}</span> — set
              a renewal reminder before then.
            </p>
          )}
          <p>
            {approved
              ? 'Next: close out the case and start the candidate onboarding.'
              : 'Next: record the appeal path or close the case.'}
          </p>
        </>
      ),
    };
  }

  const decided = day(input.decisionAt);
  return {
    heading: 'Case closed.',
    body: (
      <p>
        {decided ? (
          <>
            Decision recorded on <span className="font-medium text-foreground">{decided}</span>.{' '}
          </>
        ) : null}
        No further action needed on this case. Historical record only.
      </p>
    ),
  };
}

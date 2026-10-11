import { format, formatDistanceToNow } from 'date-fns';
import { BadgeCheck, CheckCircle2, Inbox, Send, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Phase 1 blueprint §3.1 — immigration case phased content area.
 *
 * Before this landed, the overview tab tried to show case details +
 * beneficiary + sponsor + billing all at once. A new hire opened the
 * page and had no idea what to do next.
 *
 * This hero component is the first thing in the main content area and
 * swaps between four phases driven by case status:
 *
 *   OPEN / DOCUMENTS_PENDING → Intake — gather documents from the
 *                              beneficiary. Shows the mandatory-doc
 *                              progress bar as the heartbeat.
 *   SUBMITTED / UNDER_AUTHORITY_REVIEW → Submission — the case is with
 *                              the authority. Shows submitted/decision
 *                              dates + a reminder-setup nudge.
 *   APPROVED / REJECTED      → Decision — a verdict exists. Shows the
 *                              decision date + a nudge to close out.
 *   CLOSED                   → Terminal — minimal "case closed" header.
 *
 * The secondary panels (Beneficiary / Sponsor / Billing) still render
 * below the hero. The hero carries the one clear "what should I do
 * right now" story.
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

export function phaseFromStatus(status: string): ImmigrationPhase {
  if (status === 'OPEN' || status === 'DOCUMENTS_PENDING') return 'INTAKE';
  if (status === 'SUBMITTED' || status === 'UNDER_AUTHORITY_REVIEW') return 'SUBMISSION';
  if (status === 'APPROVED' || status === 'REJECTED') return 'DECISION';
  return 'TERMINAL';
}

export function CasePhaseHero({
  input,
  beneficiaryName,
}: {
  input: CaseHeroInput;
  beneficiaryName: string;
}) {
  const phase = phaseFromStatus(input.status);
  const openedLabel = formatDistanceToNow(input.openedAt, { addSuffix: true });

  if (phase === 'INTAKE')
    return (
      <IntakePhase input={input} beneficiaryName={beneficiaryName} openedLabel={openedLabel} />
    );
  if (phase === 'SUBMISSION') return <SubmissionPhase input={input} />;
  if (phase === 'DECISION') return <DecisionPhase input={input} />;
  return <TerminalPhase input={input} />;
}

function PhaseShell({
  tone,
  icon,
  eyebrow,
  heading,
  body,
  children,
}: {
  tone: 'intake' | 'submission' | 'approved' | 'rejected' | 'closed';
  icon: ReactNode;
  eyebrow: string;
  heading: string;
  body: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section
      className={cn(
        'rounded-xl border px-5 py-5',
        tone === 'intake' &&
          'border-sky-200 bg-sky-50/70 dark:border-sky-900/60 dark:bg-sky-950/40',
        tone === 'submission' &&
          'border-amber-200 bg-amber-50/70 dark:border-amber-900/60 dark:bg-amber-950/40',
        tone === 'approved' &&
          'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/60 dark:bg-emerald-950/40',
        tone === 'rejected' &&
          'border-rose-200 bg-rose-50/70 dark:border-rose-900/60 dark:bg-rose-950/40',
        tone === 'closed' && 'border-border bg-muted/30',
      )}
    >
      <div className="flex items-start gap-4">
        <span
          className={cn(
            'grid size-10 shrink-0 place-items-center rounded-lg',
            tone === 'intake' && 'bg-sky-100 text-sky-700 dark:bg-sky-900/60 dark:text-sky-200',
            tone === 'submission' &&
              'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-200',
            tone === 'approved' &&
              'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200',
            tone === 'rejected' &&
              'bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-200',
            tone === 'closed' && 'bg-muted text-muted-foreground',
          )}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            {eyebrow}
          </p>
          <h2 className="mt-0.5 text-lg font-semibold leading-tight text-foreground">{heading}</h2>
          <div className="mt-1 text-sm text-foreground/80">{body}</div>
          {children}
        </div>
      </div>
    </section>
  );
}

function IntakePhase({
  input,
  beneficiaryName,
  openedLabel,
}: {
  input: CaseHeroInput;
  beneficiaryName: string;
  openedLabel: string;
}) {
  const { total, missingMandatory, totalMandatory } = input.requirements;
  const providedMandatory = totalMandatory - missingMandatory;
  const pct = totalMandatory === 0 ? 0 : Math.round((providedMandatory / totalMandatory) * 100);
  const allIn = missingMandatory === 0 && totalMandatory > 0;

  return (
    <PhaseShell
      tone="intake"
      icon={<Inbox className="size-5" aria-hidden />}
      eyebrow={`Phase 1 of 4 · opened ${openedLabel}`}
      heading={
        allIn
          ? 'All documents received — ready to submit to the authority.'
          : `Collecting documents from ${beneficiaryName}.`
      }
      body={
        totalMandatory === 0 ? (
          <p>Define the required documents for this case type to start the intake checklist.</p>
        ) : allIn ? (
          <p>Review the attached documents, then move the case to Submitted when you lodge it.</p>
        ) : (
          <p>
            {missingMandatory} of {totalMandatory} required document
            {totalMandatory === 1 ? '' : 's'} still outstanding. Chase the beneficiary — or send a
            document request from the Documents tab.
          </p>
        )
      }
    >
      {totalMandatory > 0 && (
        <div className="mt-3 space-y-1.5">
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-sky-100 dark:bg-sky-900/40"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${pct}% of mandatory documents received`}
          >
            <span
              className="block h-full rounded-full bg-sky-500 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            {providedMandatory} / {totalMandatory} mandatory documents received
            {total > totalMandatory ? ` · ${total - totalMandatory} optional` : ''}
          </p>
        </div>
      )}
    </PhaseShell>
  );
}

function SubmissionPhase({ input }: { input: CaseHeroInput }) {
  const submitted = input.submittedAt
    ? format(new Date(`${input.submittedAt}T00:00:00Z`), 'd MMM yyyy')
    : null;
  const reminderSet = Boolean(input.reminderOn);
  const reminderLabel = input.reminderOn
    ? format(new Date(`${input.reminderOn}T00:00:00Z`), 'd MMM yyyy')
    : null;

  return (
    <PhaseShell
      tone="submission"
      icon={<Send className="size-5" aria-hidden />}
      eyebrow={`Phase 2 of 4 · with the authority`}
      heading={
        input.status === 'SUBMITTED'
          ? 'Case submitted — awaiting a decision.'
          : 'Under authority review.'
      }
      body={
        <>
          {submitted && (
            <p>
              Submitted on <span className="font-medium text-foreground">{submitted}</span>.
            </p>
          )}
          {reminderSet ? (
            <p className="mt-1">
              Reminder set for <span className="font-medium text-foreground">{reminderLabel}</span>{' '}
              — a task fires that day so the case can't go quiet.
            </p>
          ) : (
            <p className="mt-1">
              No reminder set. Add one from the case header so this case doesn't drift.
            </p>
          )}
        </>
      }
    />
  );
}

function DecisionPhase({ input }: { input: CaseHeroInput }) {
  const decided = input.decisionAt
    ? format(new Date(`${input.decisionAt}T00:00:00Z`), 'd MMM yyyy')
    : null;
  const approved = input.status === 'APPROVED';
  const expiresLabel = input.expiresOn
    ? format(new Date(`${input.expiresOn}T00:00:00Z`), 'd MMM yyyy')
    : null;

  return (
    <PhaseShell
      tone={approved ? 'approved' : 'rejected'}
      icon={
        approved ? (
          <CheckCircle2 className="size-5" aria-hidden />
        ) : (
          <XCircle className="size-5" aria-hidden />
        )
      }
      eyebrow={`Phase 3 of 4 · decision recorded`}
      heading={approved ? 'Permit approved.' : 'Case rejected.'}
      body={
        <>
          {decided && (
            <p>
              Decided on <span className="font-medium text-foreground">{decided}</span>.
            </p>
          )}
          {approved && expiresLabel && (
            <p className="mt-1">
              Permit expires on <span className="font-medium text-foreground">{expiresLabel}</span>{' '}
              — set a renewal reminder before then.
            </p>
          )}
          <p className="mt-1">
            {approved
              ? 'Next: close out the case and start the candidate onboarding.'
              : 'Next: record the appeal path or close the case.'}
          </p>
        </>
      }
    />
  );
}

function TerminalPhase({ input }: { input: CaseHeroInput }) {
  const decided = input.decisionAt
    ? format(new Date(`${input.decisionAt}T00:00:00Z`), 'd MMM yyyy')
    : null;

  return (
    <PhaseShell
      tone="closed"
      icon={<BadgeCheck className="size-5" aria-hidden />}
      eyebrow={`Phase 4 of 4 · case closed`}
      heading="Case closed."
      body={
        <p>
          {decided ? (
            <>
              Decision recorded on <span className="font-medium text-foreground">{decided}</span>.{' '}
            </>
          ) : null}
          No further action needed on this case. Historical record only.
        </p>
      }
    />
  );
}

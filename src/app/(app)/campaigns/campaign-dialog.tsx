'use client';

import { Briefcase, Loader2, Lock, Search, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type ReactElement, useEffect, useMemo, useRef, useState } from 'react';
import { ActionDialog, fieldError } from '@/components/action-dialog';
import { FOCUS_RING, SEG_TRAY, segItem } from '@/components/ds/segmented';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { fetchJobsForCampaignPickerAction, saveCampaignAction } from '@/modules/campaigns/actions';

export type JobOption = {
  id: string;
  title: string;
  employerId: string;
  employerName: string;
  status?: string;
};

export type CampaignFormInitial = {
  id: string;
  name: string;
  notes: string | null;
  jobRequisitionId: string | null;
  requisitionTitle: string | null;
  requisitionStatus?: string | null;
  employerId: string | null;
  employerName: string | null;
  /** The job is locked once the campaign has prospects or has ended. */
  jobLocked: boolean;
};

type Kind = 'pool' | 'job';

const JOB_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft',
  OPEN: 'Open',
  IN_PROGRESS: 'In progress',
  PARTIALLY_FILLED: 'Partly filled',
  FILLED: 'Filled',
  CLOSED: 'Closed',
  CANCELLED: 'Cancelled',
};

/**
 * Create or edit a campaign. Owner decision 7 — two kinds only:
 *  - Talent pool: no job and no employer.
 *  - For a job: pick an advertisable job (title · employer · status); the
 *    employer comes from the job and is shown read-only, never chosen.
 * The server re-checks the job (shared eligibility rule) and refuses an
 * employer that does not match it. New campaigns start as Draft; after
 * Create the user lands on the new campaign. Every open starts blank (or
 * on the record being edited) via ActionDialog's onReset.
 */
export function CampaignFormDialog({
  trigger,
  initial,
  prefillJob,
  prefillNotice,
  defaultOpen,
}: {
  trigger: ReactElement;
  initial?: CampaignFormInitial;
  /** Deep link from a job ("Start advertisement"). */
  prefillJob?: JobOption | null;
  /** Deep link to a job that cannot be advertised: why it is not preselected. */
  prefillNotice?: string | null;
  defaultOpen?: boolean;
}) {
  const router = useRouter();
  const startJob: JobOption | null = initial?.jobRequisitionId
    ? {
        id: initial.jobRequisitionId,
        title: initial.requisitionTitle ?? 'Linked job',
        employerId: initial.employerId ?? '',
        employerName: initial.employerName ?? '',
        status: initial.requisitionStatus ?? undefined,
      }
    : (prefillJob ?? null);
  const startKind: Kind = initial
    ? initial.jobRequisitionId
      ? 'job'
      : 'pool'
    : prefillJob || prefillNotice
      ? 'job'
      : 'pool';
  const locked = Boolean(initial?.jobLocked);

  const [kind, setKind] = useState<Kind>(startKind);
  const [name, setName] = useState(initial?.name ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [job, setJob] = useState<JobOption | null>(startJob);
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState<string | null>(prefillNotice ?? null);
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [jobsState, setJobsState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  // Load the job list only once the dialog has been opened in job mode.
  const [opened, setOpened] = useState(Boolean(defaultOpen));

  const reset = () => {
    setKind(initial ? startKind : 'pool');
    setName(initial?.name ?? '');
    setNotes(initial?.notes ?? '');
    setJob(initial ? startJob : null);
    setQuery('');
    setNotice(null);
    setOpened(true);
    // Reload on every open so a job opened or filled meanwhile is current.
    setJobsState('idle');
  };

  // Only the latest request may update the list (a reopen starts a new one).
  const requestSeq = useRef(0);
  useEffect(() => {
    if (!opened || locked || kind !== 'job' || jobsState !== 'idle') return;
    const seq = ++requestSeq.current;
    setJobsState('loading');
    fetchJobsForCampaignPickerAction().then((r) => {
      if (seq !== requestSeq.current) return;
      if (!r.ok) {
        setJobsState('error');
        return;
      }
      setJobs(r.data);
      setJobsState('ready');
    });
  }, [opened, locked, kind, jobsState]);

  const visibleJobs = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? jobs.filter((j) => `${j.title} ${j.employerName}`.toLowerCase().includes(q))
      : jobs;
    return list.slice(0, 50);
  }, [jobs, query]);

  return (
    <ActionDialog
      trigger={trigger}
      defaultOpen={defaultOpen}
      onReset={reset}
      title={initial ? 'Edit campaign' : 'New recruitment campaign'}
      description={
        initial
          ? undefined
          : 'Campaigns start as a draft. Record each advertisement you post, then activate the campaign once the adverts are up.'
      }
      submitLabel={initial ? 'Save changes' : 'Create campaign'}
      successMessage={initial ? 'Campaign updated' : 'Campaign created'}
      submitDisabled={!locked && kind === 'job' && !job}
      onSubmit={async () => {
        const r = await saveCampaignAction({
          id: initial?.id,
          name,
          notes,
          // Only the job is sent: the employer is always the job's employer.
          jobRequisitionId: locked
            ? (initial?.jobRequisitionId ?? '')
            : kind === 'job'
              ? (job?.id ?? '')
              : '',
        });
        if (r.ok && !initial) router.push(`/campaigns/${r.data.id}`);
        return r;
      }}
    >
      {(errors) => (
        <>
          <FormField id="cm-name" label="Name" required error={fieldError(errors, 'name')}>
            <Input
              id="cm-name"
              value={name}
              autoComplete="off"
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Healthcare assistants — Kerala, spring intake"
            />
          </FormField>

          {locked ? (
            <FormField
              id="cm-job"
              label="Job"
              hint="The job can’t change once a campaign has prospects or has ended."
            >
              <p id="cm-job" className="text-sm">
                {initial?.requisitionTitle
                  ? `${initial.requisitionTitle}${initial.employerName ? ` · ${initial.employerName}` : ''}`
                  : 'Talent pool — no job'}
              </p>
            </FormField>
          ) : (
            <>
              <fieldset className="space-y-1.5">
                <legend className="mb-1.5 text-sm font-medium">Campaign type</legend>
                <div className={cn(SEG_TRAY, 'flex w-full')} data-testid="campaign-type">
                  {(
                    [
                      ['pool', 'Talent pool', Users],
                      ['job', 'For a job', Briefcase],
                    ] as const
                  ).map(([k, label, Icon]) => (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={kind === k}
                      onClick={() => setKind(k)}
                      className={segItem(kind === k, 'flex-1 justify-center')}
                    >
                      <Icon className="size-3.5" aria-hidden />
                      {label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {kind === 'pool'
                    ? 'Collect prospects for future jobs. Not tied to an employer or a job.'
                    : 'Advertise one open job. The employer comes from the job.'}
                </p>
              </fieldset>

              {kind === 'job' && (
                <>
                  {notice && (
                    <p
                      className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-500/10 dark:text-amber-200"
                      role="status"
                    >
                      {notice}
                    </p>
                  )}
                  {job ? (
                    <FormField
                      id="cm-job"
                      label="Job"
                      error={fieldError(errors, 'jobRequisitionId')}
                    >
                      <div
                        className="flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5"
                        data-testid="campaign-selected-job"
                      >
                        <div className="min-w-0">
                          <p id="cm-job" className="truncate text-sm font-semibold">
                            {job.title}
                          </p>
                          {job.status && (
                            <p className="text-xs text-muted-foreground">
                              {JOB_STATUS_LABEL[job.status] ?? job.status}
                            </p>
                          )}
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setJob(null);
                            setQuery('');
                          }}
                        >
                          Change
                        </Button>
                      </div>
                    </FormField>
                  ) : (
                    <FormField
                      id="cm-job-search"
                      label="Job"
                      required
                      hint="Only open jobs can be advertised. Search by job title or employer."
                      error={fieldError(errors, 'jobRequisitionId')}
                    >
                      <div className="relative">
                        <Search
                          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                          aria-hidden
                        />
                        <Input
                          id="cm-job-search"
                          value={query}
                          autoComplete="off"
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder="e.g. Healthcare Assistant or Sunrise Care"
                          className="pl-9"
                        />
                      </div>
                      <div
                        className="mt-2 max-h-56 overflow-y-auto rounded-md border"
                        data-testid="campaign-job-results"
                        aria-busy={jobsState === 'loading'}
                      >
                        {jobsState === 'error' ? (
                          <div
                            className="flex items-center justify-between gap-2 px-3 py-3 text-xs text-destructive"
                            role="alert"
                          >
                            Could not load jobs.
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => setJobsState('idle')}
                            >
                              Retry
                            </Button>
                          </div>
                        ) : jobsState !== 'ready' ? (
                          <p className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
                            <Loader2 className="size-3.5 animate-spin" aria-hidden /> Loading jobs…
                          </p>
                        ) : visibleJobs.length === 0 ? (
                          <p className="px-3 py-3 text-xs text-muted-foreground">
                            {jobs.length === 0
                              ? 'No open jobs to advertise. Open a job first, or make this a talent-pool campaign.'
                              : 'No open job matches that search.'}
                          </p>
                        ) : (
                          <ul className="divide-y">
                            {visibleJobs.map((j) => (
                              <li key={j.id}>
                                <button
                                  type="button"
                                  data-job-id={j.id}
                                  onClick={() => {
                                    setJob(j);
                                    setNotice(null);
                                  }}
                                  className={cn(
                                    'flex w-full flex-col px-3 py-2 text-left text-sm transition-colors hover:bg-muted',
                                    FOCUS_RING,
                                  )}
                                >
                                  <span className="font-medium">{j.title}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {j.employerName}
                                    {j.status ? ` · ${JOB_STATUS_LABEL[j.status] ?? j.status}` : ''}
                                  </span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </FormField>
                  )}
                  <FormField
                    id="cm-employer"
                    label="Employer"
                    hint={job ? 'Set by the job — it can’t be chosen separately.' : undefined}
                  >
                    <p
                      id="cm-employer"
                      className={cn(
                        'flex items-center gap-1.5 text-sm',
                        job ? 'font-medium' : 'text-muted-foreground',
                      )}
                      data-testid="campaign-employer-readonly"
                    >
                      {job ? (
                        <>
                          <Lock className="size-3.5 text-muted-foreground" aria-hidden />
                          {job.employerName}
                        </>
                      ) : (
                        'Comes from the job you choose'
                      )}
                    </p>
                  </FormField>
                </>
              )}
            </>
          )}

          <FormField id="cm-notes" label="Notes" error={fieldError(errors, 'notes')}>
            <Textarea
              id="cm-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </FormField>
        </>
      )}
    </ActionDialog>
  );
}

'use client';

import { Loader2 } from 'lucide-react';
import { type ReactElement, useEffect, useRef, useState } from 'react';
import { ActionDialog, fieldError } from '@/components/action-dialog';
import { type EmployerOption, EmployerSearchSelect } from '@/components/employer-search-select';
import { FormField } from '@/components/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { fetchJobsForCampaignPickerAction, saveCampaignAction } from '@/modules/campaigns/actions';

type JobOption = { id: string; title: string; employerId: string; employerName: string };

export type CampaignFormInitial = {
  id: string;
  name: string;
  notes: string | null;
  jobRequisitionId: string | null;
  requisitionTitle: string | null;
  employerId: string | null;
  employerName: string | null;
  /** The job is locked once the campaign has prospects or has ended. */
  jobLocked: boolean;
};

/**
 * R4 — create or edit a campaign. The employer is optional and narrows the
 * job list; the server re-checks that the job belongs to that employer and
 * is open. New campaigns start as Draft (status changes are separate).
 */
export function CampaignFormDialog({
  trigger,
  initial,
  prefillJob,
  defaultOpen,
}: {
  trigger: ReactElement;
  initial?: CampaignFormInitial;
  /** Deep link from a job ("Start a campaign"). */
  prefillJob?: JobOption | null;
  defaultOpen?: boolean;
}) {
  const startJob: JobOption | null = initial?.jobRequisitionId
    ? {
        id: initial.jobRequisitionId,
        title: initial.requisitionTitle ?? 'Current job',
        employerId: initial.employerId ?? '',
        employerName: initial.employerName ?? '',
      }
    : (prefillJob ?? null);
  const [name, setName] = useState(initial?.name ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [employer, setEmployer] = useState<EmployerOption | null>(
    startJob?.employerId ? { id: startJob.employerId, legalName: startJob.employerName } : null,
  );
  const [jobId, setJobId] = useState(startJob?.id ?? '');
  const [jobs, setJobs] = useState<JobOption[]>(startJob ? [startJob] : []);
  const [jobsState, setJobsState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const locked = Boolean(initial?.jobLocked);
  // The starting job never changes while the dialog is mounted.
  const startJobRef = useRef(startJob);

  useEffect(() => {
    const startJob = startJobRef.current;
    if (locked) return;
    let cancelled = false;
    setJobsState('loading');
    fetchJobsForCampaignPickerAction(employer?.id).then((r) => {
      if (cancelled) return;
      if (!r.ok) {
        setJobsState('error');
        return;
      }
      const list: JobOption[] = [...r.data];
      if (
        startJob &&
        !list.some((j) => j.id === startJob.id) &&
        startJob.employerId === employer?.id
      ) {
        list.unshift(startJob);
      }
      setJobs(list);
      setJobsState('ready');
    });
    return () => {
      cancelled = true;
    };
  }, [employer?.id, locked]);

  return (
    <ActionDialog
      trigger={trigger}
      defaultOpen={defaultOpen}
      title={initial ? 'Edit campaign' : 'New recruitment campaign'}
      description={
        initial
          ? undefined
          : 'Campaigns start as a draft. Add advertisements, then activate the campaign when it goes live.'
      }
      submitLabel={initial ? 'Save changes' : 'Create campaign'}
      successMessage={initial ? 'Campaign updated' : 'Campaign created'}
      onSubmit={() =>
        saveCampaignAction({
          id: initial?.id,
          name,
          notes,
          employerId: employer?.id ?? '',
          jobRequisitionId: jobId,
        })
      }
    >
      {(errors) => (
        <>
          <FormField id="cm-name" label="Name" required error={fieldError(errors, 'name')}>
            <Input
              id="cm-name"
              value={name}
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
                  : 'Talent pool (no job)'}
              </p>
            </FormField>
          ) : (
            <>
              <FormField
                id="cm-employer"
                label="Employer (optional)"
                hint="Narrows the job list to this employer."
                error={fieldError(errors, 'employerId')}
              >
                <EmployerSearchSelect
                  id="cm-employer"
                  value={employer}
                  onChange={(next) => {
                    setEmployer(next);
                    setJobId('');
                  }}
                />
              </FormField>
              {employer && (
                <button
                  type="button"
                  className="-mt-2 text-xs text-muted-foreground underline-offset-2 hover:underline"
                  onClick={() => {
                    setEmployer(null);
                    setJobId('');
                  }}
                >
                  Clear employer
                </button>
              )}
              <FormField
                id="cm-job"
                label="Job"
                hint="Leave as talent pool to collect prospects for future jobs."
                error={fieldError(errors, 'jobRequisitionId')}
              >
                <div className="relative">
                  <Select
                    id="cm-job"
                    value={jobId}
                    onChange={(e) => setJobId(e.target.value)}
                    disabled={jobsState === 'loading'}
                  >
                    <option value="">Talent pool (no job)</option>
                    {jobs.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.title}
                        {employer ? '' : ` — ${j.employerName}`}
                      </option>
                    ))}
                  </Select>
                  {jobsState === 'loading' && (
                    <Loader2
                      className="absolute right-8 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground"
                      aria-label="Loading jobs"
                    />
                  )}
                </div>
                {jobsState === 'error' && (
                  <p className="text-xs text-destructive" role="alert">
                    Could not load jobs. Close and reopen the dialog to try again.
                  </p>
                )}
                {jobsState === 'ready' && employer && jobs.length === 0 && (
                  <p className="text-xs text-muted-foreground">This employer has no open jobs.</p>
                )}
              </FormField>
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

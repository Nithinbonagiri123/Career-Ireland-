'use client';

import { type ReactElement, useState } from 'react';
import { FormField } from '@/components/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { BUSINESS_TIMEZONE, INTERVIEW_TIMEZONES, toZonedLocal } from '@/lib/zoned-time';
import {
  cancelInterviewAction,
  recordInterviewResultAction,
  scheduleInterviewAction,
  updateInterviewAction,
  updateInterviewFeedbackAction,
} from '@/modules/interviews/actions';
import type {
  RequisitionApplicationOption,
  RequisitionInterviewRow,
} from '@/modules/requisitions/workspace';
import { ActionDialog, fieldError } from './action-dialog';

const MODE_LABEL: Record<string, string> = {
  VIDEO: 'Video call',
  PHONE: 'Phone',
  IN_PERSON: 'In person',
  PANEL: 'Panel',
};

/** Applications that can be interviewed (the edges into INTERVIEW, plus INTERVIEW). */
export const INTERVIEWABLE = ['APPLIED', 'UNDER_REVIEW', 'SHORTLISTED', 'INTERVIEW'];

export function InterviewFormDialog({
  trigger,
  applications,
  existing,
  defaultApplicationId,
}: {
  trigger: ReactElement;
  applications: RequisitionApplicationOption[];
  existing?: RequisitionInterviewRow;
  defaultApplicationId?: string;
}) {
  const eligible = applications.filter((a) => INTERVIEWABLE.includes(a.status));
  const [applicationId, setApplicationId] = useState(
    existing?.applicationId ?? defaultApplicationId ?? eligible[0]?.applicationId ?? '',
  );
  const [timeZone, setTimeZone] = useState<string>(BUSINESS_TIMEZONE);
  const [localDateTime, setLocalDateTime] = useState(
    existing ? toZonedLocal(new Date(existing.scheduledAt), BUSINESS_TIMEZONE) : '',
  );
  const [durationMinutes, setDuration] = useState(String(existing?.durationMinutes ?? 45));
  const [mode, setMode] = useState(existing?.mode ?? 'VIDEO');
  const [location, setLocation] = useState(existing?.location ?? '');
  const [interviewerNames, setInterviewers] = useState(existing?.interviewerNames ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const selected = applications.find((a) => a.applicationId === applicationId);
  const willAdvance = !existing && selected && selected.status !== 'INTERVIEW';

  return (
    <ActionDialog
      trigger={trigger}
      wide
      title={existing ? 'Edit interview' : 'Schedule interview'}
      description={
        existing
          ? `${existing.personName} · round ${existing.round}`
          : 'The time is saved exactly and shown in Irish time everywhere else.'
      }
      submitLabel={existing ? 'Save changes' : 'Schedule interview'}
      successMessage={existing ? 'Interview updated' : 'Interview scheduled'}
      onSubmit={() => {
        const common = {
          localDateTime,
          timeZone,
          durationMinutes,
          mode: mode as 'VIDEO',
          location,
          interviewerNames,
          notes,
        };
        return existing
          ? updateInterviewAction({ interviewId: existing.id, ...common })
          : scheduleInterviewAction({ applicationId, ...common });
      }}
    >
      {(errors) => (
        <>
          {!existing && (
            <FormField
              id="iv-candidate"
              label="Candidate"
              required
              error={fieldError(errors, 'applicationId')}
              hint={
                willAdvance
                  ? `Scheduling moves this application from ${selected?.status.replace(/_/g, ' ').toLowerCase()} to Interview.`
                  : undefined
              }
            >
              {eligible.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No candidates can be interviewed yet. Add or promote candidates on the Pipeline
                  tab first.
                </p>
              ) : (
                <Select
                  id="iv-candidate"
                  value={applicationId}
                  onChange={(e) => setApplicationId(e.target.value)}
                >
                  {eligible.map((a) => (
                    <option key={a.applicationId} value={a.applicationId}>
                      {a.personName} — {a.status.replace(/_/g, ' ').toLowerCase()}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField
              id="iv-when"
              label="Date and time"
              required
              error={fieldError(errors, 'localDateTime')}
            >
              <Input
                id="iv-when"
                type="datetime-local"
                value={localDateTime}
                onChange={(e) => setLocalDateTime(e.target.value)}
              />
            </FormField>
            <FormField id="iv-tz" label="Timezone" error={fieldError(errors, 'timeZone')}>
              <Select id="iv-tz" value={timeZone} onChange={(e) => setTimeZone(e.target.value)}>
                {INTERVIEW_TIMEZONES.map((z) => (
                  <option key={z.value} value={z.value}>
                    {z.label}
                  </option>
                ))}
              </Select>
            </FormField>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField id="iv-mode" label="Interview type">
              <Select id="iv-mode" value={mode} onChange={(e) => setMode(e.target.value)}>
                {Object.entries(MODE_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField
              id="iv-duration"
              label="Duration (minutes)"
              error={fieldError(errors, 'durationMinutes')}
            >
              <Input
                id="iv-duration"
                type="number"
                min={5}
                max={480}
                value={durationMinutes}
                onChange={(e) => setDuration(e.target.value)}
              />
            </FormField>
          </div>
          <FormField
            id="iv-location"
            label={mode === 'IN_PERSON' ? 'Address' : 'Meeting link or dial-in'}
            error={fieldError(errors, 'location')}
          >
            <Input
              id="iv-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder={mode === 'IN_PERSON' ? 'Ward 3, Cork University Hospital' : 'https://…'}
            />
          </FormField>
          <FormField
            id="iv-interviewers"
            label="Interviewer(s)"
            hint="Employer-side names, e.g. Mary Walsh (Director of Nursing)"
            error={fieldError(errors, 'interviewerNames')}
          >
            <Input
              id="iv-interviewers"
              value={interviewerNames}
              onChange={(e) => setInterviewers(e.target.value)}
            />
          </FormField>
          <FormField id="iv-notes" label="Notes" error={fieldError(errors, 'notes')}>
            <Textarea
              id="iv-notes"
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

export function CancelInterviewDialog({
  trigger,
  interview,
}: {
  trigger: ReactElement;
  interview: RequisitionInterviewRow;
}) {
  const [reason, setReason] = useState('');
  return (
    <ActionDialog
      trigger={trigger}
      destructive
      title="Cancel interview?"
      description={`${interview.personName} · round ${interview.round}. The record stays in the history.`}
      submitLabel="Cancel interview"
      successMessage="Interview cancelled"
      onSubmit={() => cancelInterviewAction({ interviewId: interview.id, reason })}
    >
      {(errors) => (
        <FormField
          id="iv-cancel-reason"
          label="Reason"
          required
          error={fieldError(errors, 'reason')}
        >
          <Textarea
            id="iv-cancel-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Employer moved the interview; candidate withdrew…"
          />
        </FormField>
      )}
    </ActionDialog>
  );
}

export function InterviewResultDialog({
  trigger,
  interview,
  mode,
}: {
  trigger: ReactElement;
  interview: RequisitionInterviewRow;
  /** record = first result after the interview; feedback = update a completed one */
  mode: 'record' | 'feedback';
}) {
  const [result, setResult] = useState<'COMPLETED' | 'NO_SHOW'>('COMPLETED');
  const [outcome, setOutcome] = useState(
    interview.outcome !== 'PENDING' ? interview.outcome : 'PASS',
  );
  const [feedback, setFeedback] = useState('');
  return (
    <ActionDialog
      trigger={trigger}
      title={mode === 'record' ? 'Record interview result' : 'Update outcome and feedback'}
      description={`${interview.personName} · round ${interview.round}`}
      submitLabel="Save"
      successMessage={mode === 'record' ? 'Interview result recorded' : 'Feedback saved'}
      onSubmit={() =>
        mode === 'record'
          ? recordInterviewResultAction({
              interviewId: interview.id,
              result,
              outcome: result === 'COMPLETED' ? (outcome as 'PASS') : undefined,
              feedback,
            })
          : updateInterviewFeedbackAction({
              interviewId: interview.id,
              outcome: outcome as 'PASS',
              feedback,
            })
      }
    >
      {(errors) => (
        <>
          {mode === 'record' && (
            <FormField id="iv-result" label="What happened?">
              <Select
                id="iv-result"
                value={result}
                onChange={(e) => setResult(e.target.value as 'COMPLETED' | 'NO_SHOW')}
              >
                <option value="COMPLETED">Interview took place</option>
                <option value="NO_SHOW">Candidate did not attend</option>
              </Select>
            </FormField>
          )}
          {(mode === 'feedback' || result === 'COMPLETED') && (
            <FormField
              id="iv-outcome"
              label="Outcome"
              required
              error={fieldError(errors, 'outcome')}
            >
              <Select id="iv-outcome" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
                <option value="PASS">Pass — move forward</option>
                <option value="HOLD">On hold</option>
                <option value="FAIL">Not successful</option>
              </Select>
            </FormField>
          )}
          <FormField
            id="iv-feedback"
            label="Feedback"
            hint="Added to the interview notes with your name and the time."
            error={fieldError(errors, 'feedback')}
          >
            <Textarea
              id="iv-feedback"
              rows={4}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
            />
          </FormField>
        </>
      )}
    </ActionDialog>
  );
}

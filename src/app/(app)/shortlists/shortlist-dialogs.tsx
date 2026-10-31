'use client';

import { type ReactElement, useState } from 'react';
import { ActionDialog, fieldError } from '@/components/action-dialog';
import { FormField } from '@/components/form-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  recordEmployerFeedbackAction,
  recordPresentedToEmployerAction,
  removeFromShortlistAction,
} from '@/modules/matching/actions';

export function PresentedDialog({
  trigger,
  entryId,
  requisitionId,
  personName,
  today,
  current,
}: {
  trigger: ReactElement;
  entryId: string;
  requisitionId: string;
  personName: string;
  today: string;
  current: string | null;
}) {
  const [presentedOn, setPresentedOn] = useState(current ?? today);
  return (
    <ActionDialog
      trigger={trigger}
      title={current ? 'Change presentation date' : `Record ${personName} as presented`}
      description="The day the candidate’s profile went to the employer. Recorded for this shortlist entry and audited."
      submitLabel="Save"
      successMessage={`${personName} recorded as presented`}
      onSubmit={() =>
        recordPresentedToEmployerAction({ shortlistEntryId: entryId, presentedOn }, requisitionId)
      }
    >
      {(errors) => (
        <FormField
          id="sl-presented"
          label="Presented on"
          required
          error={fieldError(errors, 'presentedOn')}
        >
          <Input
            id="sl-presented"
            type="date"
            max={today}
            value={presentedOn}
            onChange={(e) => setPresentedOn(e.target.value)}
          />
        </FormField>
      )}
    </ActionDialog>
  );
}

export function FeedbackDialog({
  trigger,
  entryId,
  requisitionId,
  personName,
  current,
}: {
  trigger: ReactElement;
  entryId: string;
  requisitionId: string;
  personName: string;
  current: string | null;
}) {
  const [feedback, setFeedback] = useState(current ?? '');
  return (
    <ActionDialog
      trigger={trigger}
      title={`Employer feedback on ${personName}`}
      description="What the employer said. Each change is kept in the audit history."
      submitLabel="Save feedback"
      successMessage="Employer feedback saved"
      onSubmit={() =>
        recordEmployerFeedbackAction({ shortlistEntryId: entryId, feedback }, requisitionId)
      }
    >
      {(errors) => (
        <FormField
          id="sl-feedback"
          label="Feedback"
          required
          error={fieldError(errors, 'feedback')}
        >
          <Textarea
            id="sl-feedback"
            rows={4}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
          />
        </FormField>
      )}
    </ActionDialog>
  );
}

export function RemoveFromShortlistDialog({
  trigger,
  entryId,
  requisitionId,
  personName,
  jobTitle,
}: {
  trigger: ReactElement;
  entryId: string;
  requisitionId: string;
  personName: string;
  jobTitle: string;
}) {
  const [reason, setReason] = useState('');
  return (
    <ActionDialog
      trigger={trigger}
      destructive
      title={`Remove ${personName} from the shortlist?`}
      description={`They leave the ${jobTitle} shortlist and their match goes back to Reviewed. A full record (dates, presentation, feedback and your reason) is kept in the removal history.`}
      submitLabel="Remove from shortlist"
      successMessage={`${personName} removed from the shortlist`}
      onSubmit={() =>
        removeFromShortlistAction({ shortlistEntryId: entryId, reason }, requisitionId)
      }
    >
      {(errors) => (
        <FormField id="sl-reason" label="Reason" required error={fieldError(errors, 'reason')}>
          <Textarea
            id="sl-reason"
            autoComplete="off"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Employer declined after reviewing the CV"
          />
        </FormField>
      )}
    </ActionDialog>
  );
}

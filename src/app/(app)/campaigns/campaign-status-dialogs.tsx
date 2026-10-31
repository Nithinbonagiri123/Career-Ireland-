'use client';

import { type ReactElement, useState } from 'react';
import { ActionDialog, fieldError } from '@/components/action-dialog';
import { FormField } from '@/components/form-field';
import { Textarea } from '@/components/ui/textarea';
import {
  archiveCampaignAction,
  transitionCampaignAction,
  unarchiveCampaignAction,
} from '@/modules/campaigns/actions';

const COPY = {
  ACTIVE: {
    title: 'Activate this campaign?',
    description:
      'Marks the campaign active from now. Advertisements you have posted can then be marked live.',
    submit: 'Activate',
    success: 'Campaign activated',
    needsReason: false,
    destructive: false,
  },
  PAUSED: {
    title: 'Pause this campaign?',
    description:
      'Advertisements marked live are suspended and no new prospects can be recorded. Existing prospects can still be screened, noted, followed up and converted.',
    submit: 'Pause campaign',
    success: 'Campaign paused',
    needsReason: false,
    destructive: false,
  },
  RESUME: {
    title: 'Resume this campaign?',
    description:
      'The campaign becomes active again. Suspended advertisements stay paused — mark each one live again from the Advertisements tab.',
    submit: 'Resume campaign',
    success: 'Campaign resumed',
    needsReason: false,
    destructive: false,
  },
  COMPLETED: {
    title: 'Complete this campaign?',
    description:
      'Ends the campaign now. Every advertisement still open or paused is closed. Prospects stay and can still be screened and converted.',
    submit: 'Complete campaign',
    success: 'Campaign completed',
    needsReason: false,
    destructive: false,
  },
  CANCELLED: {
    title: 'Cancel this campaign?',
    description:
      'Ends the campaign now and closes its advertisements. No new prospects can be added. Existing prospects are kept.',
    submit: 'Cancel campaign',
    success: 'Campaign cancelled',
    needsReason: true,
    destructive: true,
  },
} as const;

export function CampaignTransitionDialog({
  trigger,
  campaignId,
  to,
}: {
  trigger: ReactElement;
  campaignId: string;
  to: keyof typeof COPY;
}) {
  const [reason, setReason] = useState('');
  const copy = COPY[to];
  return (
    <ActionDialog
      trigger={trigger}
      onReset={() => setReason('')}
      title={copy.title}
      description={copy.description}
      submitLabel={copy.submit}
      successMessage={copy.success}
      destructive={copy.destructive}
      onSubmit={() =>
        transitionCampaignAction({ campaignId, to: to === 'RESUME' ? 'ACTIVE' : to, reason })
      }
    >
      {(errors) => (
        <FormField
          id="cm-reason"
          label={copy.needsReason ? 'Reason' : 'Note (optional)'}
          required={copy.needsReason}
          error={fieldError(errors, 'reason')}
        >
          <Textarea
            id="cm-reason"
            rows={3}
            autoComplete="off"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </FormField>
      )}
    </ActionDialog>
  );
}

export function ArchiveCampaignDialog({
  trigger,
  campaignId,
  restore,
}: {
  trigger: ReactElement;
  campaignId: string;
  restore?: boolean;
}) {
  const [reason, setReason] = useState('');
  return (
    <ActionDialog
      trigger={trigger}
      onReset={() => setReason('')}
      title={restore ? 'Restore this campaign?' : 'Archive this campaign?'}
      description={
        restore
          ? 'The campaign returns to the campaigns list.'
          : 'Archived campaigns are hidden from the list and can no longer be edited. Ads, prospects and history are kept and it can be restored.'
      }
      submitLabel={restore ? 'Restore' : 'Archive'}
      successMessage={restore ? 'Campaign restored' : 'Campaign archived'}
      destructive={!restore}
      onSubmit={() =>
        restore
          ? unarchiveCampaignAction({ campaignId, reason })
          : archiveCampaignAction({ campaignId, reason })
      }
    >
      {(errors) => (
        <FormField
          id="cm-archive-reason"
          label="Reason"
          required
          error={fieldError(errors, 'reason')}
        >
          <Textarea
            id="cm-archive-reason"
            rows={3}
            autoComplete="off"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={
              restore
                ? 'e.g. Needed for the quarterly report'
                : 'e.g. Campaign finished, role filled'
            }
          />
        </FormField>
      )}
    </ActionDialog>
  );
}

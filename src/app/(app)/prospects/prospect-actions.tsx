'use client';

import { ArrowRight, CalendarClock, CheckCircle2, MessageSquarePlus } from 'lucide-react';
import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  CONVERTIBLE,
  PROSPECT_NEXT,
  PROSPECT_STATUS_LABEL,
  type ProspectStatus,
} from '@/modules/campaigns/labels';
import {
  ConvertProspectDialog,
  FollowUpDialog,
  ProspectNoteDialog,
  ProspectStatusDialog,
} from './prospect-dialogs';

export type ProspectActionTarget = {
  id: string;
  personId: string;
  personName: string;
  status: ProspectStatus;
  hasCandidateProfile: boolean;
  followUpDueOn: string | null;
};

/** Inline action bar for one prospect. Only legal next steps are shown; the server re-checks. */
export function ProspectActions({
  prospect,
  canEdit,
  jobTitle,
  assignees,
}: {
  prospect: ProspectActionTarget;
  canEdit: boolean;
  jobTitle: string | null;
  assignees: Array<{ id: string; fullName: string }>;
}) {
  const converted = prospect.status === 'CONVERTED_TO_CANDIDATE';
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="prospect-actions">
      {converted && (
        <Link
          href={`/candidates/${prospect.personId}`}
          className={buttonVariants({ size: 'sm', variant: 'outline' })}
        >
          Open candidate <ArrowRight className="ml-1 size-3.5" />
        </Link>
      )}
      {canEdit && CONVERTIBLE.includes(prospect.status) && (
        <ConvertProspectDialog
          prospectId={prospect.id}
          personName={prospect.personName}
          hasCandidateProfile={prospect.hasCandidateProfile}
          jobTitle={jobTitle}
          trigger={
            <Button size="sm">
              <CheckCircle2 className="mr-1.5 size-3.5" /> Convert to candidate
            </Button>
          }
        />
      )}
      {canEdit &&
        PROSPECT_NEXT[prospect.status].map((to) => (
          <ProspectStatusDialog
            key={to}
            prospectId={prospect.id}
            personName={prospect.personName}
            to={to as Exclude<ProspectStatus, 'CONVERTED_TO_CANDIDATE'>}
            trigger={
              <Button size="sm" variant="outline">
                {to === 'SCREENED' && prospect.status === 'NOT_SUITABLE'
                  ? 'Reopen (screened)'
                  : `Mark ${PROSPECT_STATUS_LABEL[to].toLowerCase()}`}
              </Button>
            }
          />
        ))}
      {canEdit && (
        <ProspectNoteDialog
          prospectId={prospect.id}
          trigger={
            <Button size="sm" variant="ghost">
              <MessageSquarePlus className="mr-1.5 size-3.5" /> Note
            </Button>
          }
        />
      )}
      {canEdit && !converted && prospect.status !== 'NOT_SUITABLE' && (
        <FollowUpDialog
          prospectId={prospect.id}
          currentDueOn={prospect.followUpDueOn}
          assignees={assignees}
          trigger={
            <Button size="sm" variant="ghost">
              <CalendarClock className="mr-1.5 size-3.5" />
              {prospect.followUpDueOn ? 'Change follow-up' : 'Follow-up'}
            </Button>
          }
        />
      )}
    </div>
  );
}

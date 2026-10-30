'use client';

import { ArrowRight, CalendarClock, CheckCircle2, MessageSquarePlus } from 'lucide-react';
import Link from 'next/link';
import { RecordHeaderActions } from '@/components/record-header-actions';
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

const MENU_ITEM =
  'relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent';

/**
 * Action bar for one prospect. Only legal next steps are shown; the server
 * re-checks every action.
 *
 * `layout="header"` (prospect detail): the primary action stays visible at
 * every width; the other actions sit inline from `lg` up and inside an
 * accessible "More actions" menu below that.
 */
export function ProspectActions({
  prospect,
  canEdit,
  jobTitle,
  assignees,
  layout = 'inline',
}: {
  prospect: ProspectActionTarget;
  canEdit: boolean;
  jobTitle: string | null;
  assignees: Array<{ id: string; fullName: string }>;
  layout?: 'inline' | 'header';
}) {
  const converted = prospect.status === 'CONVERTED_TO_CANDIDATE';
  const canConvert = canEdit && CONVERTIBLE.includes(prospect.status);

  const openCandidate = converted ? (
    <Link
      key="open"
      href={`/candidates/${prospect.personId}`}
      className={buttonVariants({ size: 'sm', variant: 'outline' })}
    >
      Open candidate <ArrowRight className="ml-1 size-3.5" />
    </Link>
  ) : null;

  const convert = canConvert ? (
    <ConvertProspectDialog
      key="convert"
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
  ) : null;

  /** Secondary actions, as buttons or as menu items. */
  const secondary = (asMenu: boolean) =>
    [
      ...(canEdit
        ? PROSPECT_NEXT[prospect.status].map((to) => {
            const label =
              to === 'SCREENED' && prospect.status === 'NOT_SUITABLE'
                ? 'Reopen (screened)'
                : `Mark ${PROSPECT_STATUS_LABEL[to].toLowerCase()}`;
            return (
              <ProspectStatusDialog
                key={to}
                prospectId={prospect.id}
                personName={prospect.personName}
                to={to as Exclude<ProspectStatus, 'CONVERTED_TO_CANDIDATE'>}
                trigger={
                  asMenu ? (
                    <button type="button" className={MENU_ITEM}>
                      {label}
                    </button>
                  ) : (
                    <Button size="sm" variant="outline">
                      {label}
                    </Button>
                  )
                }
              />
            );
          })
        : []),
      canEdit ? (
        <ProspectNoteDialog
          key="note"
          prospectId={prospect.id}
          trigger={
            asMenu ? (
              <button type="button" className={MENU_ITEM}>
                <MessageSquarePlus className="size-4" /> Note
              </button>
            ) : (
              <Button size="sm" variant="ghost">
                <MessageSquarePlus className="mr-1.5 size-3.5" /> Note
              </Button>
            )
          }
        />
      ) : null,
      canEdit && !converted && prospect.status !== 'NOT_SUITABLE' ? (
        <FollowUpDialog
          key="follow"
          prospectId={prospect.id}
          currentDueOn={prospect.followUpDueOn}
          assignees={assignees}
          trigger={
            asMenu ? (
              <button type="button" className={MENU_ITEM}>
                <CalendarClock className="size-4" />
                {prospect.followUpDueOn ? 'Change follow-up' : 'Follow-up'}
              </button>
            ) : (
              <Button size="sm" variant="ghost">
                <CalendarClock className="mr-1.5 size-3.5" />
                {prospect.followUpDueOn ? 'Change follow-up' : 'Follow-up'}
              </Button>
            )
          }
        />
      ) : null,
    ].filter(Boolean);

  if (layout === 'header') {
    const inline = secondary(false);
    const menu = secondary(true);
    // No convert / open-candidate step yet (e.g. a new prospect): the first
    // legal next step becomes the always-visible primary instead.
    const promote = !openCandidate && !convert && inline.length > 0;
    const primary = openCandidate ?? convert ?? (promote ? inline[0] : null);
    const restInline = promote ? inline.slice(1) : inline;
    const restMenu = promote ? menu.slice(1) : menu;
    return (
      <div className="flex flex-wrap items-center justify-end gap-2" data-testid="prospect-actions">
        {restInline.length > 0 && (
          <div className="hidden flex-wrap items-center gap-2 lg:flex">{restInline}</div>
        )}
        {primary}
        {restMenu.length > 0 && (
          <div className="lg:hidden">
            <RecordHeaderActions overflow={restMenu} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="prospect-actions">
      {openCandidate}
      {convert}
      {secondary(false)}
    </div>
  );
}

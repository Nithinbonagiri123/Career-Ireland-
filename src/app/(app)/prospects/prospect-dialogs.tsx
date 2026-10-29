'use client';

import { Loader2, Search } from 'lucide-react';
import { type ReactElement, useState } from 'react';
import { ActionDialog, fieldError } from '@/components/action-dialog';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useServerSearch } from '@/lib/hooks/use-server-search';
import { cn } from '@/lib/utils';
import {
  addProspectNoteAction,
  convertProspectToCandidateAction,
  createProspectAction,
  setProspectFollowUpAction,
  updateProspectStatusAction,
} from '@/modules/campaigns/actions';
import { PROSPECT_STATUS_LABEL, type ProspectStatus } from '@/modules/campaigns/labels';
import { searchPersonsForPickerAction } from '@/modules/pickers/actions';
import type { PersonPickerItem } from '@/modules/pickers/service';

export type AdOption = { id: string; label: string; open: boolean };

/* ─── Capture ──────────────────────────────────────────────────────── */

export function AddProspectDialog({
  trigger,
  ads,
  defaultAdId,
}: {
  trigger: ReactElement;
  ads: AdOption[];
  defaultAdId?: string;
}) {
  const openAds = ads.filter((a) => a.open);
  const [adId, setAdId] = useState(defaultAdId ?? openAds[0]?.id ?? '');
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [selected, setSelected] = useState<PersonPickerItem | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const search = useServerSearch(searchPersonsForPickerAction, { enabled: mode === 'existing' });

  return (
    <ActionDialog
      trigger={trigger}
      wide
      title="Record a prospect"
      description="Someone who responded to an advertisement. A person can be a prospect once per campaign."
      submitLabel="Record prospect"
      successMessage="Prospect recorded"
      onSubmit={() =>
        createProspectAction({
          advertisementId: adId,
          personId: mode === 'existing' ? (selected?.id ?? '') : '',
          newPerson: mode === 'new' ? { firstName, lastName, email, phone } : undefined,
          notes,
        })
      }
    >
      {(errors) => (
        <>
          <FormField
            id="pr-ad"
            label="Advertisement"
            required
            error={fieldError(errors, 'advertisementId')}
          >
            <Select id="pr-ad" value={adId} onChange={(e) => setAdId(e.target.value)}>
              {openAds.length === 0 && <option value="">No open advertisements</option>}
              {openAds.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </Select>
          </FormField>

          <fieldset className="flex gap-1 rounded-lg bg-muted p-1 text-sm">
            <legend className="sr-only">Person</legend>
            {(['existing', 'new'] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className={cn(
                  'flex-1 rounded-md px-3 py-1.5 font-medium transition-colors',
                  mode === m ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground',
                )}
              >
                {m === 'existing' ? 'Existing person' : 'New person'}
              </button>
            ))}
          </fieldset>

          {mode === 'existing' ? (
            <FormField
              id="pr-search"
              label="Person"
              required
              error={fieldError(errors, 'personId')}
            >
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  id="pr-search"
                  value={search.query}
                  onChange={(e) => search.setQuery(e.target.value)}
                  placeholder="Search by name or email…"
                  className="pl-9"
                />
              </div>
              <div
                className="mt-2 max-h-48 overflow-y-auto rounded-md border"
                data-testid="prospect-person-results"
                aria-busy={search.status === 'loading'}
              >
                {search.status === 'error' ? (
                  <div
                    className="flex items-center justify-between gap-2 px-3 py-3 text-xs text-destructive"
                    role="alert"
                  >
                    {search.error}
                    <Button type="button" size="sm" variant="outline" onClick={search.retry}>
                      Retry
                    </Button>
                  </div>
                ) : search.items.length === 0 && search.status !== 'ready' ? (
                  <p className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" aria-hidden /> Searching…
                  </p>
                ) : search.items.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-muted-foreground">
                    No match. Switch to “New person” to add them.
                  </p>
                ) : (
                  <ul className="divide-y">
                    {search.items.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => setSelected(p)}
                          aria-pressed={selected?.id === p.id}
                          className={cn(
                            'flex w-full flex-col px-3 py-2 text-left text-sm transition-colors',
                            selected?.id === p.id ? 'bg-accent/10' : 'hover:bg-muted',
                          )}
                        >
                          <span className="font-medium">
                            {p.firstName} {p.lastName}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {p.email ?? 'No email'}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {selected && (
                <p className="text-xs text-muted-foreground">
                  Selected:{' '}
                  <span className="font-medium text-foreground">
                    {selected.firstName} {selected.lastName}
                  </span>
                </p>
              )}
            </FormField>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                id="pr-first"
                label="First name"
                required
                error={fieldError(errors, 'newPerson.firstName')}
              >
                <Input
                  id="pr-first"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </FormField>
              <FormField
                id="pr-last"
                label="Last name"
                required
                error={fieldError(errors, 'newPerson.lastName')}
              >
                <Input
                  id="pr-last"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </FormField>
              <FormField id="pr-email" label="Email" error={fieldError(errors, 'newPerson.email')}>
                <Input
                  id="pr-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </FormField>
              <FormField id="pr-phone" label="Phone" error={fieldError(errors, 'newPerson.phone')}>
                <Input id="pr-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </FormField>
              <p className="text-xs text-muted-foreground sm:col-span-2">
                Checked against existing people by email, phone and name before anyone is created.
              </p>
            </div>
          )}

          <FormField id="pr-notes" label="Note (optional)" error={fieldError(errors, 'notes')}>
            <Textarea
              id="pr-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </FormField>
        </>
      )}
    </ActionDialog>
  );
}

/* ─── Status / note / follow-up ────────────────────────────────────── */

export function ProspectStatusDialog({
  trigger,
  prospectId,
  personName,
  to,
}: {
  trigger: ReactElement;
  prospectId: string;
  personName: string;
  to: Exclude<ProspectStatus, 'CONVERTED_TO_CANDIDATE'>;
}) {
  const [notes, setNotes] = useState('');
  const needsReason = to === 'NOT_SUITABLE';
  const label = PROSPECT_STATUS_LABEL[to].toLowerCase();
  return (
    <ActionDialog
      trigger={trigger}
      title={`Mark ${personName} ${label}?`}
      submitLabel={`Mark ${label}`}
      successMessage={`${personName} marked ${label}`}
      destructive={needsReason}
      onSubmit={() => updateProspectStatusAction({ prospectId, status: to, notes })}
    >
      {(errors) => (
        <FormField
          id="ps-note"
          label={needsReason ? 'Reason' : 'Note (optional)'}
          required={needsReason}
          error={fieldError(errors, 'notes')}
        >
          <Textarea
            id="ps-note"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </FormField>
      )}
    </ActionDialog>
  );
}

export function ProspectNoteDialog({
  trigger,
  prospectId,
}: {
  trigger: ReactElement;
  prospectId: string;
}) {
  const [note, setNote] = useState('');
  return (
    <ActionDialog
      trigger={trigger}
      title="Add a note"
      description="Saved with your name and the time."
      submitLabel="Add note"
      successMessage="Note added"
      onSubmit={() => addProspectNoteAction({ prospectId, note })}
    >
      {(errors) => (
        <FormField id="pn-note" label="Note" required error={fieldError(errors, 'note')}>
          <Textarea id="pn-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </FormField>
      )}
    </ActionDialog>
  );
}

export function FollowUpDialog({
  trigger,
  prospectId,
  currentDueOn,
  assignees,
}: {
  trigger: ReactElement;
  prospectId: string;
  currentDueOn: string | null;
  assignees: Array<{ id: string; fullName: string }>;
}) {
  const [dueOn, setDueOn] = useState(currentDueOn ?? '');
  const [assignee, setAssignee] = useState('');
  return (
    <ActionDialog
      trigger={trigger}
      title={currentDueOn ? 'Change follow-up' : 'Set a follow-up'}
      description="Creates a task due at 09:00 Irish time on that day. Clear the date to remove it."
      submitLabel={dueOn ? 'Save follow-up' : 'Clear follow-up'}
      successMessage={dueOn ? 'Follow-up saved' : 'Follow-up cleared'}
      onSubmit={() => setProspectFollowUpAction({ prospectId, dueOn, assignedUserId: assignee })}
    >
      {(errors) => (
        <>
          <FormField id="fu-date" label="Follow up on" error={fieldError(errors, 'dueOn')}>
            <Input
              id="fu-date"
              type="date"
              value={dueOn}
              onChange={(e) => setDueOn(e.target.value)}
            />
          </FormField>
          <FormField id="fu-who" label="Assigned to" error={fieldError(errors, 'assignedUserId')}>
            <Select id="fu-who" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">Me</option>
              {assignees.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName}
                </option>
              ))}
            </Select>
          </FormField>
        </>
      )}
    </ActionDialog>
  );
}

/* ─── Conversion hand-off ──────────────────────────────────────────── */

export function ConvertProspectDialog({
  trigger,
  prospectId,
  personName,
  hasCandidateProfile,
  jobTitle,
}: {
  trigger: ReactElement;
  prospectId: string;
  personName: string;
  hasCandidateProfile: boolean;
  /** Campaign's open job, if any — enables "also shortlist". */
  jobTitle: string | null;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [shortlist, setShortlist] = useState(false);
  const [notes, setNotes] = useState('');
  return (
    <ActionDialog
      trigger={trigger}
      title={`Convert ${personName} to a candidate?`}
      description={
        hasCandidateProfile
          ? 'They already have a candidate profile — it will be reused, nothing is duplicated. No job application is created.'
          : 'Creates their candidate profile (available, assigned to you). No job application is created.'
      }
      submitLabel="Convert to candidate"
      successMessage={`${personName} converted to candidate`}
      submitDisabled={!confirmed}
      onSubmit={async () => {
        const r = await convertProspectToCandidateAction({
          prospectId,
          confirmed: confirmed as true,
          shortlistOnJob: shortlist,
          notes,
        });
        if (r.ok && r.data.shortlistError) {
          // Conversion stands; tell the user the shortlist step did not.
          const { toast } = await import('sonner');
          toast.warning(`Converted, but not shortlisted: ${r.data.shortlistError}`);
        }
        return r;
      }}
    >
      {(errors) => (
        <>
          {jobTitle && (
            <div className="flex items-start gap-2">
              <Checkbox
                id="cv-shortlist"
                checked={shortlist}
                onCheckedChange={(v) => setShortlist(v === true)}
                className="mt-0.5"
              />
              <Label htmlFor="cv-shortlist" className="text-sm leading-snug font-normal">
                Also add to the shortlist for <span className="font-medium">{jobTitle}</span>
              </Label>
            </div>
          )}
          <FormField id="cv-note" label="Note (optional)" error={fieldError(errors, 'notes')}>
            <Textarea
              id="cv-note"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </FormField>
          <div className="flex items-start gap-2">
            <Checkbox
              id="cv-confirm"
              checked={confirmed}
              onCheckedChange={(v) => setConfirmed(v === true)}
              className="mt-0.5"
            />
            <Label htmlFor="cv-confirm" className="text-sm leading-snug font-normal">
              I confirm {personName} has been screened and should become a candidate.
            </Label>
          </div>
          {fieldError(errors, 'confirmed') && (
            <p className="text-xs text-destructive" role="alert">
              {fieldError(errors, 'confirmed')}
            </p>
          )}
        </>
      )}
    </ActionDialog>
  );
}

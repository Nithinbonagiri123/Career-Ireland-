'use client';

import { Loader2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { FormField } from '@/components/form-field';
import { FormSection } from '@/components/form-section';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { manuallyShortlistPersonAction } from '@/modules/matching/actions';
import { createPersonAction } from '@/modules/persons/actions';

/**
 * Session 12 — add an outsourced candidate to a requisition. Separates
 * provenance from the regular "pick from the pool" flow (AddCandidateDialog)
 * so the agency / referral partner is captured at intake time, not
 * reconstructed later from notes.
 *
 * On submit: creates a Person with source=EMPLOYER_REFERRAL, prepends
 * the partner tag into notes, and shortlists the person on this
 * requisition in the same transaction.
 */
export function AddOutsourcedCandidateDialog({
  requisitionId,
  requisitionTitle,
}: {
  requisitionId: string;
  requisitionTitle: string;
}) {
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [partner, setPartner] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reset = () => {
    setFirstName('');
    setLastName('');
    setEmail('');
    setPartner('');
    setNotes('');
    setErr(null);
    setBusy(false);
  };

  const submit = async () => {
    if (!firstName.trim() || !lastName.trim() || !partner.trim()) {
      setErr('First name, last name, and outsourcing partner are required.');
      return;
    }
    setBusy(true);
    setErr(null);
    const combinedNotes = [`Outsourced from: ${partner.trim()}`, notes.trim()]
      .filter(Boolean)
      .join('\n');
    const rp = await createPersonAction({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
      phone: '',
      dateOfBirth: '',
      nationality: '',
      currentCountry: '',
      currentCity: '',
      source: 'EMPLOYER_REFERRAL',
      notes: combinedNotes,
    });
    if (!rp.ok) {
      setBusy(false);
      setErr(rp.error.message);
      return;
    }
    const shortlist = await manuallyShortlistPersonAction(rp.data.id, requisitionId);
    setBusy(false);
    if (!shortlist.ok) {
      setErr(shortlist.error.message);
      return;
    }
    toast.success(`${firstName} ${lastName} added as outsourced candidate`);
    reset();
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger
        render={
          <Button size="sm" variant="outline">
            <UserPlus className="mr-1.5 size-4" /> Add outsourced
          </Button>
        }
      />
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add outsourced candidate</DialogTitle>
          <DialogDescription>
            For candidates sourced by a partner (agency, referral partner). They land shortlisted on{' '}
            <span className="font-medium text-foreground">{requisitionTitle}</span> with the partner
            tag preserved for attribution.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-6"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          noValidate
        >
          <FormSection title="Candidate">
            <div className="grid grid-cols-2 gap-3">
              <FormField id="out-first" label="First name">
                <Input
                  id="out-first"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  autoFocus
                />
              </FormField>
              <FormField id="out-last" label="Last name">
                <Input
                  id="out-last"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </FormField>
            </div>
            <FormField id="out-email" label="Email (optional)">
              <Input
                id="out-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </FormField>
          </FormSection>

          <FormSection title="Provenance">
            <FormField
              id="out-partner"
              label="Outsourced from"
              hint="The agency or partner who sourced this candidate. Used for attribution."
            >
              <Input
                id="out-partner"
                value={partner}
                onChange={(e) => setPartner(e.target.value)}
                placeholder="e.g. Dublin Hire Partners"
              />
            </FormField>
            <FormField id="out-notes" label="Notes (optional)">
              <Input
                id="out-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. previous placement with us; CV on file"
              />
            </FormField>
          </FormSection>

          {err && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {err}
            </div>
          )}

          <DialogFooter>
            <DialogClose
              render={
                <Button variant="ghost" type="button" disabled={busy}>
                  Cancel
                </Button>
              }
            />
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
              Add + shortlist
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

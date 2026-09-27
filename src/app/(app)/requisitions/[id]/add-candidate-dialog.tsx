'use client';

import { motion } from 'framer-motion';
import { AlertCircle, Loader2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { PersonPicker } from '@/components/person-picker';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Person } from '@/lib/db/schema/persons';
import { manuallyShortlistPersonAction } from '@/modules/matching/actions';

/**
 * "Add candidate" for the requisition pipeline. Complements Run assisted
 * matching: when staff already know the right person, they can search by
 * name/email and drop them straight into Shortlisted without waiting for
 * the scorer to surface them. The PersonPicker's inline "+ Add new
 * candidate" affordance means even not-yet-in-system people are one dialog
 * away — created and shortlisted in the same flow.
 */
export function AddCandidateDialog({
  requisitionId,
  requisitionTitle,
  persons,
}: {
  requisitionId: string;
  requisitionTitle: string;
  persons: Person[];
}) {
  const [open, setOpen] = useState(false);
  const [personId, setPersonId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const reset = () => {
    setPersonId('');
    setFormError(null);
    setSubmitting(false);
  };

  const submit = async () => {
    if (!personId) {
      setFormError('Pick a candidate first');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    const r = await manuallyShortlistPersonAction(personId, requisitionId);
    setSubmitting(false);
    if (!r.ok) {
      setFormError(r.error.message);
      return;
    }
    const picked = persons.find((p) => p.id === personId);
    toast.success(
      picked
        ? `${picked.firstName} ${picked.lastName} added to Shortlisted`
        : 'Candidate added to Shortlisted',
    );
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
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <UserPlus className="mr-1.5 size-4" /> Add candidate
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add candidate to {requisitionTitle}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Search for a candidate by name or email — they'll land in the{' '}
            <span className="font-medium text-foreground">Shortlisted</span> lane straight away. Not
            in the system yet? Use{' '}
            <span className="whitespace-nowrap font-medium text-foreground">
              + Add new candidate
            </span>{' '}
            at the bottom of the search list.
          </p>
          <PersonPicker
            persons={persons}
            value={personId}
            onChange={setPersonId}
            placeholder="Search candidate by name or email…"
          />
          {formError && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
              role="alert"
            >
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
              <span>{formError}</span>
            </motion.div>
          )}
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
          <Button onClick={submit} disabled={submitting || !personId}>
            {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            Add to shortlist
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

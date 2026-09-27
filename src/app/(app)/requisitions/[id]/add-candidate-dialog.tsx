'use client';

import { motion } from 'framer-motion';
import { AlertCircle, Loader2, Mail, Plus, Search, User, UserPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import type { Person } from '@/lib/db/schema/persons';
import { cn } from '@/lib/utils';
import { manuallyShortlistPersonAction } from '@/modules/matching/actions';
import { createPersonAction } from '@/modules/persons/actions';

/**
 * "Add candidate" for the requisition pipeline. Complements Run assisted
 * matching: when staff already know the right person, they type their name
 * (or email) and click Add to shortlist. No trigger → dropdown two-step —
 * the whole dialog IS the search surface.
 *
 * When the query has no matches, an "Add + shortlist X" affordance
 * creates the person and shortlists them in the same click.
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
  const [query, setQuery] = useState('');
  const [personId, setPersonId] = useState('');
  const [locallyCreated, setLocallyCreated] = useState<Person[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const allPersons = useMemo(() => [...locallyCreated, ...persons], [persons, locallyCreated]);

  // Filter by name or email; cap at 30 rows so a huge list stays scrollable
  // without turning the dialog into a wall of names.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allPersons.slice(0, 30);
    return allPersons
      .filter((p) => `${p.firstName} ${p.lastName} ${p.email ?? ''}`.toLowerCase().includes(q))
      .slice(0, 30);
  }, [allPersons, query]);

  const reset = () => {
    setQuery('');
    setPersonId('');
    setFormError(null);
    setSubmitting(false);
  };

  const submit = async (id: string) => {
    setSubmitting(true);
    setFormError(null);
    const r = await manuallyShortlistPersonAction(id, requisitionId);
    setSubmitting(false);
    if (!r.ok) {
      setFormError(r.error.message);
      return;
    }
    const picked = allPersons.find((p) => p.id === id);
    toast.success(
      picked
        ? `${picked.firstName} ${picked.lastName} added to Shortlisted`
        : 'Added to Shortlisted',
    );
    reset();
    setOpen(false);
  };

  // "Create + shortlist in one" when the query has no match. Parses the
  // query as either "Firstname" or "Firstname Lastname" and creates the
  // Person with source=DIRECT so it lands in the same pool as any other
  // hand-entered lead. Extra fields (email, phone, DOB…) can be filled
  // in from the candidate profile once created.
  const createAndShortlist = async () => {
    const q = query.trim();
    if (!q) return;
    setSubmitting(true);
    setFormError(null);
    const parts = q.split(/\s+/);
    const firstName = parts[0] ?? q;
    const lastName = parts.slice(1).join(' ') || '—';
    const rp = await createPersonAction({
      firstName,
      lastName,
      email: '',
      phone: '',
      dateOfBirth: '',
      nationality: '',
      currentCountry: '',
      currentCity: '',
      source: 'DIRECT',
      notes: '',
    });
    if (!rp.ok) {
      setSubmitting(false);
      setFormError(rp.error.message);
      return;
    }
    setLocallyCreated((prev) => [rp.data, ...prev]);
    await submit(rp.data.id);
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
            <UserPlus className="mr-1.5 size-4" /> Add candidate
          </Button>
        }
      />
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add candidate to {requisitionTitle}</DialogTitle>
        </DialogHeader>

        <p className="text-sm leading-relaxed text-muted-foreground">
          Type a name or email. Pick a candidate to drop them straight into{' '}
          <span className="font-medium text-foreground">Shortlisted</span> — no need to run matching
          first. Nobody in the list yet? An{' '}
          <span className="whitespace-nowrap font-medium text-foreground">Add + shortlist</span>{' '}
          shortcut appears at the bottom.
        </p>

        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or email…"
            className="pl-9"
            autoFocus
          />
        </div>

        <div className="max-h-64 overflow-y-auto rounded-md border">
          {filtered.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-muted-foreground">
              No candidates match "{query.trim()}". Use{' '}
              <span className="font-medium text-foreground">Add + shortlist</span> below to create
              them.
            </div>
          ) : (
            <ul className="divide-y">
              {filtered.map((p) => {
                const isSelected = personId === p.id;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setPersonId(p.id)}
                      className={cn(
                        'flex w-full items-center gap-3 px-3 py-2 text-left transition-colors',
                        isSelected ? 'bg-accent/10' : 'hover:bg-muted',
                      )}
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-xs font-medium">
                        {(p.firstName[0] ?? '?').toUpperCase()}
                        {(p.lastName[0] ?? '').toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {p.firstName} {p.lastName}
                        </span>
                        {p.email && (
                          <span className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                            <Mail className="size-3 shrink-0" />
                            {p.email}
                          </span>
                        )}
                      </span>
                      {isSelected && (
                        <span className="text-[11px] font-medium uppercase tracking-wide text-accent">
                          Selected
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {query.trim() && (
          <button
            type="button"
            onClick={createAndShortlist}
            disabled={submitting}
            className="flex w-full items-center gap-2 rounded-md border border-dashed border-border/70 px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:border-accent hover:text-accent disabled:opacity-60"
          >
            <Plus className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">
              Add + shortlist <span className="font-medium text-foreground">"{query.trim()}"</span>{' '}
              as a new candidate
            </span>
          </button>
        )}

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

        <DialogFooter>
          <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
          <Button onClick={() => submit(personId)} disabled={submitting || !personId}>
            {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            <User className="mr-1.5 size-3.5" />
            Add to shortlist
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

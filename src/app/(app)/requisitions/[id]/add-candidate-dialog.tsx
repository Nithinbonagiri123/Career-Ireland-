'use client';

import { motion } from 'framer-motion';
import { AlertCircle, Loader2, Mail, Plus, Search, User, UserPlus } from 'lucide-react';
import { useState } from 'react';
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
import { useServerSearch } from '@/lib/hooks/use-server-search';
import { cn } from '@/lib/utils';
import { manuallyShortlistPersonAction } from '@/modules/matching/actions';
import { createPersonAction } from '@/modules/persons/actions';
import { searchPersonsForPickerAction } from '@/modules/pickers/actions';
import type { PersonPickerItem } from '@/modules/pickers/service';

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
}: {
  requisitionId: string;
  requisitionTitle: string;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<PersonPickerItem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // R2 — candidates are searched on the server (paginated, access-checked)
  // instead of shipping every person to the browser with the page.
  const search = useServerSearch(searchPersonsForPickerAction, { enabled: open });
  const query = search.query;
  const personId = selected?.id ?? '';

  const reset = () => {
    search.reset();
    setSelected(null);
    setFormError(null);
    setSubmitting(false);
  };

  const submit = async (id: string, name?: string) => {
    setSubmitting(true);
    setFormError(null);
    const r = await manuallyShortlistPersonAction(id, requisitionId);
    setSubmitting(false);
    if (!r.ok) {
      setFormError(r.error.message);
      return;
    }
    const label = name ?? (selected ? `${selected.firstName} ${selected.lastName}` : null);
    toast.success(label ? `${label} added to Shortlisted` : 'Added to Shortlisted');
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
    await submit(rp.data.id, `${rp.data.firstName} ${rp.data.lastName}`);
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
            onChange={(e) => search.setQuery(e.target.value)}
            placeholder="Search by name or email…"
            className="pl-9"
            autoFocus
          />
        </div>

        <div
          className="max-h-64 overflow-y-auto rounded-md border"
          aria-busy={search.status === 'loading'}
          data-testid="candidate-search-results"
        >
          {search.status === 'error' ? (
            <div
              className="flex flex-col items-center gap-2 px-4 py-6 text-center text-xs text-destructive"
              role="alert"
            >
              <span>{search.error}</span>
              <Button type="button" size="sm" variant="outline" onClick={search.retry}>
                Try again
              </Button>
            </div>
          ) : search.items.length === 0 && search.status !== 'ready' ? (
            <div className="flex items-center justify-center gap-2 px-4 py-6 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" aria-hidden /> Searching…
            </div>
          ) : search.items.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-muted-foreground">
              {query.trim() ? (
                <>
                  No candidates match "{query.trim()}". Use{' '}
                  <span className="font-medium text-foreground">Add + shortlist</span> below to
                  create them.
                </>
              ) : (
                'No active candidates yet. Type a name to add one.'
              )}
            </div>
          ) : (
            <ul className="divide-y">
              {search.items.map((p) => {
                const isSelected = personId === p.id;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(p)}
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
              {search.hasMore && (
                <li>
                  <button
                    type="button"
                    onClick={search.loadMore}
                    disabled={search.status === 'loading'}
                    className="flex w-full items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-60"
                  >
                    {search.status === 'loading' && (
                      <Loader2 className="size-3 animate-spin" aria-hidden />
                    )}
                    Show more
                  </button>
                </li>
              )}
            </ul>
          )}
        </div>

        {/* Offered only once the search for exactly this text has finished,
            so nobody creates a duplicate of a candidate still loading. */}
        {query.trim() && search.settled && (
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

'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { motion } from 'framer-motion';
import { AlertCircle, ChevronsUpDown, Loader2, Plus, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Person } from '@/lib/db/schema/persons';
import { cn } from '@/lib/utils';
import { createPersonAction } from '@/modules/persons/actions';

/**
 * Reusable "Select existing person OR create new" picker.
 *
 * Search filters the pre-loaded persons list client-side (name + email).
 * The "+ Add new candidate" affordance opens a nested inline-create dialog
 * with the smallest viable form (first + last + optional email + phone);
 * once saved the new person is prepended to the local list and auto-selected.
 *
 * Meant to replace every raw `<select>` of Persons across the app — this is
 * the first landing site (immigration case dialog) but the same component
 * powers requisitions, engagements, and any future module that needs a
 * canonical candidate reference.
 */

const CreateFormSchema = z.object({
  firstName: z.string().min(1, 'First name required').max(100),
  lastName: z.string().min(1, 'Last name required').max(100),
  email: z.string().email('Invalid email').max(200).optional().or(z.literal('')),
  phone: z.string().max(30).optional().or(z.literal('')),
});
type CreateFormValues = z.infer<typeof CreateFormSchema>;

type Props = {
  /** Pre-loaded persons list. New rows created via + Add new are prepended locally. */
  persons: Person[];
  /** Currently-selected person id (or empty string for none). */
  value: string;
  /** Fired when the user picks (or newly-creates) a person. */
  onChange: (personId: string) => void;
  /** Rendered on the trigger + used as ARIA label. */
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
};

function personLabel(p: Person): string {
  const name = `${p.firstName} ${p.lastName}`.trim();
  return p.email ? `${name} · ${p.email}` : name;
}

export function PersonPicker({
  persons,
  value,
  onChange,
  placeholder = 'Select candidate',
  disabled,
  invalid,
  id,
}: Props) {
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [locallyCreated, setLocallyCreated] = useState<Person[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Merge locally-created rows with the server-provided list. Local rows come
  // first so a just-created candidate is at the top when the picker reopens.
  const allPersons = useMemo(() => [...locallyCreated, ...persons], [persons, locallyCreated]);

  const selected = useMemo(
    () => allPersons.find((p) => p.id === value) ?? null,
    [allPersons, value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allPersons.slice(0, 50); // cap so the dropdown doesn't get out of hand
    return allPersons
      .filter((p) => {
        const hay = `${p.firstName} ${p.lastName} ${p.email ?? ''}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 50);
  }, [allPersons, query]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // Focus the search input when the dropdown opens.
  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const pick = (p: Person) => {
    onChange(p.id);
    setOpen(false);
    setQuery('');
  };

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setQuery('');
  };

  const handleCreated = (created: Person) => {
    setLocallyCreated((prev) => [created, ...prev]);
    setCreateOpen(false);
    onChange(created.id);
    setOpen(false);
    setQuery('');
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-invalid={invalid}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          // Right padding leaves room for the absolutely-positioned clear +
          // chevron overlay below (pr-14 when a selection can be cleared,
          // pr-8 otherwise so the chevron still has breathing room).
          'flex h-9 w-full items-center rounded-md border bg-background pl-3 text-sm outline-none transition-colors',
          'hover:border-foreground/20 focus-visible:ring-2 focus-visible:ring-ring',
          selected && !disabled ? 'pr-14' : 'pr-8',
          invalid && 'border-destructive',
          disabled && 'cursor-not-allowed opacity-60',
        )}
      >
        {/* min-w-0 + flex-1 is critical: without it, a long 'Name · long.email@domain'
            label refuses to shrink and pushes the trailing overlay off the right edge. */}
        <span
          className={cn('min-w-0 flex-1 truncate text-left', !selected && 'text-muted-foreground')}
        >
          {selected ? personLabel(selected) : placeholder}
        </span>
      </button>
      {/* Trailing controls are siblings of the trigger button — nesting a
          <button> inside a <button> is invalid HTML and blows up hydration.
          pointer-events-none on the wrapper + pointer-events-auto on the
          clear button means clicks on the chevron pass through to the
          trigger below and toggle the dropdown as expected. */}
      <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center gap-1">
        {selected && !disabled && (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear selection"
            className="pointer-events-auto rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
        <ChevronsUpDown className="size-3.5 text-muted-foreground" />
      </span>

      {open && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.12 }}
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-hidden rounded-md border bg-popover shadow-lg"
        >
          <div className="border-b p-2">
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or email…"
              className="h-8 text-sm"
            />
          </div>
          <div className="max-h-52 overflow-auto py-1 text-sm">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">
                No matches. Use “+ Add new candidate” to create one.
              </div>
            ) : (
              filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => pick(p)}
                  className={cn(
                    'block w-full px-3 py-1.5 text-left transition-colors hover:bg-muted',
                    p.id === value && 'bg-muted font-medium',
                  )}
                >
                  <span>
                    {p.firstName} {p.lastName}
                  </span>
                  {p.email && <span className="ml-2 text-xs text-muted-foreground">{p.email}</span>}
                </button>
              ))
            )}
          </div>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="flex w-full items-center gap-2 border-t px-3 py-2 text-left text-sm text-accent hover:bg-muted"
          >
            <Plus className="size-3.5" />
            Add new candidate
            {query.trim() && <span className="text-muted-foreground">— “{query.trim()}”</span>}
          </button>
        </motion.div>
      )}

      <CreatePersonDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        prefillFromQuery={query.trim()}
        onCreated={handleCreated}
      />
    </div>
  );
}

function CreatePersonDialog({
  open,
  onOpenChange,
  prefillFromQuery,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  prefillFromQuery: string;
  onCreated: (p: Person) => void;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateFormValues>({
    resolver: zodResolver(CreateFormSchema),
    defaultValues: { firstName: '', lastName: '', email: '', phone: '' },
  });

  // If the user typed something in the search box that looks like a first name
  // (single word), prefill the firstName field. Two-word queries seed first + last.
  useEffect(() => {
    if (!open) return;
    const q = prefillFromQuery;
    if (!q) return;
    const parts = q.split(/\s+/);
    if (parts.length === 1 && parts[0])
      reset({ firstName: parts[0], lastName: '', email: '', phone: '' });
    else if (parts.length >= 2) {
      const first = parts[0] ?? '';
      const rest = parts.slice(1).join(' ');
      reset({ firstName: first, lastName: rest, email: '', phone: '' });
    }
  }, [open, prefillFromQuery, reset]);

  const onSubmit = handleSubmit(async (data) => {
    setFormError(null);
    const r = await createPersonAction({
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email ?? '',
      phone: data.phone ?? '',
      dateOfBirth: '',
      nationality: '',
      currentCountry: '',
      currentCity: '',
      source: 'DIRECT',
      notes: '',
    });
    if (!r.ok) {
      setFormError(r.error.message);
      return;
    }
    toast.success('Candidate created');
    reset();
    onCreated(r.data);
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          reset();
          setFormError(null);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add new candidate</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pp-first">First name</Label>
              <Input
                id="pp-first"
                aria-invalid={Boolean(errors.firstName)}
                {...register('firstName')}
              />
              {errors.firstName && (
                <p className="text-xs text-destructive">{errors.firstName.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pp-last">Last name</Label>
              <Input
                id="pp-last"
                aria-invalid={Boolean(errors.lastName)}
                {...register('lastName')}
              />
              {errors.lastName && (
                <p className="text-xs text-destructive">{errors.lastName.message}</p>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pp-email">Email (optional)</Label>
            <Input
              id="pp-email"
              type="email"
              aria-invalid={Boolean(errors.email)}
              {...register('email')}
            />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pp-phone">Phone (optional)</Label>
            <Input id="pp-phone" {...register('phone')} />
          </div>
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
          <p className="text-[11px] text-muted-foreground">
            Extra fields (DOB, nationality, address) can be filled in from the candidate’s profile
            once created.
          </p>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>Cancel</DialogClose>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
              Create candidate
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
